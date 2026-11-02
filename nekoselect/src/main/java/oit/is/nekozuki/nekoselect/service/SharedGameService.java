package oit.is.nekozuki.nekoselect.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import oit.is.nekozuki.nekoselect.model.MatchRoom;

@Service
public class SharedGameService {

  private static final Duration COUNTDOWN_DURATION = Duration.ofSeconds(3);
  private static final int MINIMUM_BOARD_SIZE = 12;

  private final MatchRoomService matchRoomService;
  private final Clock clock;
  private final Map<String, GameState> games = new HashMap<>();

  @Autowired
  public SharedGameService(MatchRoomService matchRoomService) {
    this(matchRoomService, Clock.systemUTC());
  }

  public SharedGameService(MatchRoomService matchRoomService, Clock clock) {
    this.matchRoomService = matchRoomService;
    this.clock = clock;
  }

  public synchronized Optional<GameView> openGame(String roomId, String username) {
    Optional<MatchRoom> room = matchRoomService.findRoom(roomId);
    if (room.isEmpty()) {
      return Optional.empty();
    }

    List<String> participants = room.get().getParticipants();
    if (!participants.contains(username)) {
      return Optional.empty();
    }

    GameState game = games.computeIfAbsent(roomId, ignored -> {
      GameState created = new GameState(participants);
      created.tiles = createBoard(participants.size());
      return created;
    });
    resetIfParticipantsChanged(game, participants);
    if (game.phase == Phase.WAITING_FOR_PLAYERS) {
      game.readyParticipants.add(username);
      updatePhase(game);
    }
    return Optional.of(toView(game, username));
  }

  public synchronized Optional<GameView> getState(String roomId, String username) {
    Optional<GameState> game = findGameForParticipant(roomId, username);
    if (game.isEmpty()) {
      return Optional.empty();
    }

    Optional<MatchRoom> room = matchRoomService.findRoom(roomId);
    if (room.isEmpty()) {
      return Optional.empty();
    }
    resetIfParticipantsChanged(game.get(), room.get().getParticipants());
    if (game.get().phase == Phase.WAITING_FOR_PLAYERS) {
      game.get().readyParticipants.add(username);
    }
    updatePhase(game.get());
    return Optional.of(toView(game.get(), username));
  }

  public synchronized Optional<ClickResult> click(String roomId, String username, String tileId) {
    Optional<GameState> gameOptional = findGameForParticipant(roomId, username);
    if (gameOptional.isEmpty()) {
      return Optional.empty();
    }

    GameState game = gameOptional.get();
    updatePhase(game);
    TileState tile = game.tiles.stream()
        .filter(candidate -> candidate.id.equals(tileId))
        .findFirst()
        .orElse(null);
    if (tile == null) {
      return Optional.of(new ClickResult(ClickOutcome.NOT_FOUND, toView(game, username)));
    }
    if (tile.type == TileType.CAT && tile.claimedBy != null) {
      return Optional.of(new ClickResult(ClickOutcome.ALREADY_CLAIMED, toView(game, username)));
    }
    if (game.phase != Phase.PLAYING) {
      return Optional.of(new ClickResult(ClickOutcome.GAME_NOT_ACTIVE, toView(game, username)));
    }
    if (tile.type == TileType.NUCO) {
      return Optional.of(new ClickResult(ClickOutcome.MISS, toView(game, username)));
    }

    tile.claimedBy = username;
    if (remainingCats(game) == 0) {
      game.phase = Phase.FINISHED;
    }
    return Optional.of(new ClickResult(ClickOutcome.CLAIMED, toView(game, username)));
  }

  private Optional<GameState> findGameForParticipant(String roomId, String username) {
    Optional<MatchRoom> room = matchRoomService.findRoom(roomId);
    GameState game = games.get(roomId);
    if (room.isEmpty() || game == null || !game.participants.contains(username)) {
      return Optional.empty();
    }
    return Optional.of(game);
  }

  private void resetIfParticipantsChanged(GameState game, List<String> currentParticipants) {
    if (game.phase != Phase.WAITING_FOR_PLAYERS && game.phase != Phase.COUNTDOWN) {
      return;
    }
    if (game.participants.equals(new LinkedHashSet<>(currentParticipants))) {
      return;
    }

    game.participants.clear();
    game.participants.addAll(currentParticipants);
    game.readyParticipants.clear();
    game.startsAt = null;
    game.phase = Phase.WAITING_FOR_PLAYERS;
    game.tiles = createBoard(currentParticipants.size());
  }

  private void updatePhase(GameState game) {
    if (game.phase == Phase.WAITING_FOR_PLAYERS
        && game.participants.size() >= 2
        && game.readyParticipants.containsAll(game.participants)) {
      game.startsAt = clock.instant().plus(COUNTDOWN_DURATION);
      game.phase = Phase.COUNTDOWN;
    }
    if (game.phase == Phase.COUNTDOWN && !clock.instant().isBefore(game.startsAt)) {
      game.phase = remainingCats(game) == 0 ? Phase.FINISHED : Phase.PLAYING;
    }
  }

  private GameView toView(GameState game, String username) {
    boolean revealTileTypes = game.phase == Phase.PLAYING || game.phase == Phase.FINISHED;
    List<TileView> tileViews = game.tiles.stream()
        .map(tile -> new TileView(tile.id, revealTileTypes ? tile.type : null, tile.claimedBy))
        .toList();
    List<String> losers = game.phase == Phase.FINISHED
        ? game.participants.stream()
            .filter(participant -> game.tiles.stream()
                .noneMatch(tile -> participant.equals(tile.claimedBy)))
            .toList()
        : List.of();
    String result = null;
    if (game.phase == Phase.FINISHED) {
      result = losers.contains(username) ? "負け" : "勝ち";
    }
    return new GameView(game.phase, tileViews, game.participants.size(), game.readyParticipants.size(),
        game.startsAt, remainingCats(game), losers, result);
  }

  private List<TileState> createBoard(int participantCount) {
    int catCount = Math.max(0, participantCount - 1);
    int boardSize = Math.max(MINIMUM_BOARD_SIZE, catCount + 1);
    List<TileState> tiles = new ArrayList<>();
    for (int index = 0; index < boardSize; index++) {
      TileType type = index < catCount ? TileType.CAT : TileType.NUCO;
      tiles.add(new TileState("tile-" + (index + 1), type));
    }
    Collections.shuffle(tiles);
    return tiles;
  }

  private int remainingCats(GameState game) {
    return (int) game.tiles.stream()
        .filter(tile -> tile.type == TileType.CAT && tile.claimedBy == null)
        .count();
  }

  public enum Phase {
    WAITING_FOR_PLAYERS,
    COUNTDOWN,
    PLAYING,
    FINISHED
  }

  public enum TileType {
    CAT,
    NUCO
  }

  public enum ClickOutcome {
    CLAIMED,
    ALREADY_CLAIMED,
    MISS,
    GAME_NOT_ACTIVE,
    NOT_FOUND
  }

  public record TileView(String id, TileType type, String claimedBy) {
  }

  public record GameView(Phase phase, List<TileView> tiles, int participantCount, int readyCount,
      Instant startsAt, int remainingCats, List<String> losers, String result) {
  }

  public record ClickResult(ClickOutcome outcome, GameView game) {
  }

  private static class GameState {
    private final Set<String> participants = new LinkedHashSet<>();
    private final Set<String> readyParticipants = new HashSet<>();
    private List<TileState> tiles;
    private Phase phase = Phase.WAITING_FOR_PLAYERS;
    private Instant startsAt;

    private GameState(List<String> participants) {
      this.participants.addAll(participants);
      this.tiles = new ArrayList<>();
    }
  }

  private static class TileState {
    private final String id;
    private final TileType type;
    private String claimedBy;

    private TileState(String id, TileType type) {
      this.id = id;
      this.type = type;
    }
  }
}
