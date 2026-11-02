package oit.is.nekozuki.nekoselect;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;

import oit.is.nekozuki.nekoselect.model.MatchRoom;
import oit.is.nekozuki.nekoselect.service.MatchRoomService;
import oit.is.nekozuki.nekoselect.service.SharedGameService;
import oit.is.nekozuki.nekoselect.service.SharedGameService.ClickOutcome;
import oit.is.nekozuki.nekoselect.service.SharedGameService.GameView;
import oit.is.nekozuki.nekoselect.service.SharedGameService.Phase;
import oit.is.nekozuki.nekoselect.service.SharedGameService.TileType;

class SharedGameServiceTests {

  @Test
  void 全員が開くまで待機し最後の参加者の準備から3秒後に開始する() {
    MutableClock clock = new MutableClock(Instant.parse("2026-11-01T00:00:00Z"));
    MatchRoomService rooms = new MatchRoomService();
    MatchRoom room = rooms.createRoom("alice");
    rooms.joinRoom(room.getId(), "bob");
    SharedGameService service = new SharedGameService(rooms, clock);

    GameView waiting = service.openGame(room.getId(), "alice").orElseThrow();
    assertEquals(Phase.WAITING_FOR_PLAYERS, waiting.phase());

    GameView countdown = service.openGame(room.getId(), "bob").orElseThrow();
    assertEquals(Phase.COUNTDOWN, countdown.phase());
    assertEquals(clock.instant().plusSeconds(3), countdown.startsAt());

    clock.advance(Duration.ofMillis(2999));
    assertEquals(Phase.COUNTDOWN, service.getState(room.getId(), "alice").orElseThrow().phase());
    clock.advance(Duration.ofMillis(1));
    assertEquals(Phase.PLAYING, service.getState(room.getId(), "bob").orElseThrow().phase());
  }

  @Test
  void 参加者が一人だけでは開始せず後から参加した全員の準備を待つ() {
    MutableClock clock = new MutableClock(Instant.parse("2026-11-01T00:00:00Z"));
    MatchRoomService rooms = new MatchRoomService();
    MatchRoom room = rooms.createRoom("alice");
    SharedGameService service = new SharedGameService(rooms, clock);

    GameView waiting = service.openGame(room.getId(), "alice").orElseThrow();
    assertEquals(Phase.WAITING_FOR_PLAYERS, waiting.phase());
    assertEquals(1, waiting.participantCount());
    assertEquals(null, waiting.startsAt());

    rooms.joinRoom(room.getId(), "bob");
    GameView bobReady = service.openGame(room.getId(), "bob").orElseThrow();
    assertEquals(Phase.WAITING_FOR_PLAYERS, bobReady.phase());
    assertEquals(1, bobReady.readyCount());

    GameView countdown = service.getState(room.getId(), "alice").orElseThrow();
    assertEquals(Phase.COUNTDOWN, countdown.phase());
    assertEquals(2, countdown.readyCount());
    assertEquals(clock.instant().plusSeconds(3), countdown.startsAt());
  }

  @Test
  void 全参加者に同じ盤面が表示されねこの数は参加者より少ない() {
    MatchRoomService rooms = new MatchRoomService();
    MatchRoom room = createTwoPlayerRoom(rooms);
    MutableClock clock = new MutableClock(Instant.now());
    SharedGameService service = new SharedGameService(rooms, clock);

    GameView alice = service.openGame(room.getId(), "alice").orElseThrow();
    GameView bob = service.openGame(room.getId(), "bob").orElseThrow();

    assertEquals(alice.tiles(), bob.tiles());
    assertTrue(alice.tiles().stream().allMatch(tile -> tile.type() == null));

    clock.advance(Duration.ofSeconds(3));
    GameView alicePlaying = service.getState(room.getId(), "alice").orElseThrow();
    GameView bobPlaying = service.getState(room.getId(), "bob").orElseThrow();

    assertEquals(Phase.PLAYING, alicePlaying.phase());
    assertEquals(alicePlaying.tiles(), bobPlaying.tiles());
    long catCount = alicePlaying.tiles().stream().filter(tile -> tile.type() == TileType.CAT).count();
    long nucoCount = alicePlaying.tiles().stream().filter(tile -> tile.type() == TileType.NUCO).count();
    assertTrue(catCount < alicePlaying.participantCount());
    assertTrue(nucoCount > 0);
  }

  @Test
  void カウントダウン中に参加者が増えると全員の準備をやり直す() {
    MutableClock clock = new MutableClock(Instant.parse("2026-11-01T00:00:00Z"));
    MatchRoomService rooms = new MatchRoomService();
    MatchRoom room = createTwoPlayerRoom(rooms);
    SharedGameService service = new SharedGameService(rooms, clock);
    service.openGame(room.getId(), "alice");
    service.openGame(room.getId(), "bob");

    rooms.joinRoom(room.getId(), "carol");
    GameView reset = service.openGame(room.getId(), "carol").orElseThrow();

    assertEquals(Phase.WAITING_FOR_PLAYERS, reset.phase());
    assertEquals(1, reset.readyCount());
    assertEquals(3, reset.participantCount());
    service.openGame(room.getId(), "alice");
    GameView countdown = service.openGame(room.getId(), "bob").orElseThrow();
    assertEquals(Phase.COUNTDOWN, countdown.phase());
    assertEquals(3, countdown.readyCount());
  }

  @Test
  void 同じねこへの同時クリックは一人だけが取得できる() throws Exception {
    MutableClock clock = new MutableClock(Instant.parse("2026-11-01T00:00:00Z"));
    MatchRoomService rooms = new MatchRoomService();
    MatchRoom room = createTwoPlayerRoom(rooms);
    SharedGameService service = startTwoPlayerGame(rooms, room, clock);
    String catId = service.getState(room.getId(), "alice").orElseThrow().tiles().stream()
        .filter(tile -> tile.type() == TileType.CAT)
        .findFirst()
        .orElseThrow()
        .id();
    CountDownLatch start = new CountDownLatch(1);

    try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
      Future<ClickOutcome> alice = executor.submit(() -> {
        start.await();
        return service.click(room.getId(), "alice", catId).orElseThrow().outcome();
      });
      Future<ClickOutcome> bob = executor.submit(() -> {
        start.await();
        return service.click(room.getId(), "bob", catId).orElseThrow().outcome();
      });
      start.countDown();

      List<ClickOutcome> outcomes = List.of(alice.get(), bob.get());
      assertEquals(1, outcomes.stream().filter(outcome -> outcome == ClickOutcome.CLAIMED).count());
      assertEquals(1, outcomes.stream().filter(outcome -> outcome == ClickOutcome.ALREADY_CLAIMED).count());
    }
  }

  @Test
  void ぬこをクリックしてもペナルティがなくゲームは続く() {
    MutableClock clock = new MutableClock(Instant.parse("2026-11-01T00:00:00Z"));
    MatchRoomService rooms = new MatchRoomService();
    MatchRoom room = createTwoPlayerRoom(rooms);
    SharedGameService service = startTwoPlayerGame(rooms, room, clock);
    GameView game = service.getState(room.getId(), "alice").orElseThrow();
    String nucoId = game.tiles().stream()
        .filter(tile -> tile.type() == TileType.NUCO)
        .findFirst()
        .orElseThrow()
        .id();

    var result = service.click(room.getId(), "alice", nucoId).orElseThrow();

    assertEquals(ClickOutcome.MISS, result.outcome());
    assertEquals(Phase.PLAYING, result.game().phase());
    assertEquals(1, result.game().remainingCats());
    assertTrue(result.game().losers().isEmpty());
  }

  @Test
  void ねこがなくなると取得できなかった参加者が負けになる() {
    MutableClock clock = new MutableClock(Instant.parse("2026-11-01T00:00:00Z"));
    MatchRoomService rooms = new MatchRoomService();
    MatchRoom room = createTwoPlayerRoom(rooms);
    SharedGameService service = startTwoPlayerGame(rooms, room, clock);
    String catId = service.getState(room.getId(), "alice").orElseThrow().tiles().stream()
        .filter(tile -> tile.type() == TileType.CAT)
        .findFirst()
        .orElseThrow()
        .id();

    var result = service.click(room.getId(), "alice", catId).orElseThrow();

    assertEquals(Phase.FINISHED, result.game().phase());
    assertEquals("勝ち", result.game().result());
    assertEquals(List.of("bob"), result.game().losers());
    assertEquals("負け", service.getState(room.getId(), "bob").orElseThrow().result());
  }

  @Test
  void ルームに参加していない利用者はゲームにアクセスできない() {
    MatchRoomService rooms = new MatchRoomService();
    MatchRoom room = rooms.createRoom("alice");
    SharedGameService service = new SharedGameService(rooms, Clock.systemUTC());

    assertFalse(service.openGame(room.getId(), "stranger").isPresent());
  }

  private MatchRoom createTwoPlayerRoom(MatchRoomService rooms) {
    MatchRoom room = rooms.createRoom("alice");
    rooms.joinRoom(room.getId(), "bob");
    return room;
  }

  private SharedGameService startTwoPlayerGame(MatchRoomService rooms, MatchRoom room, MutableClock clock) {
    SharedGameService service = new SharedGameService(rooms, clock);
    service.openGame(room.getId(), "alice");
    service.openGame(room.getId(), "bob");
    clock.advance(Duration.ofSeconds(3));
    assertEquals(Phase.PLAYING, service.getState(room.getId(), "alice").orElseThrow().phase());
    return service;
  }

  private static class MutableClock extends Clock {
    private Instant instant;

    private MutableClock(Instant instant) {
      this.instant = instant;
    }

    @Override
    public ZoneId getZone() {
      return ZoneId.of("UTC");
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return instant;
    }

    private void advance(Duration duration) {
      instant = instant.plus(duration);
    }
  }
}
