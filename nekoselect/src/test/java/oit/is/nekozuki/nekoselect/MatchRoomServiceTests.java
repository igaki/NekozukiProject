package oit.is.nekozuki.nekoselect;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import oit.is.nekozuki.nekoselect.model.MatchRoom;
import oit.is.nekozuki.nekoselect.service.MatchRoomService;

class MatchRoomServiceTests {

  @Test
  void ルームを作成すると作成者が参加者になり一覧に載る() {
    MatchRoomService service = new MatchRoomService();

    MatchRoom room = service.createRoom("alice");

    assertEquals(List.of("alice"), room.getParticipants());
    assertEquals(List.of(room), service.listRooms());
  }

  @Test
  void 別のプレイヤーが参加すると参加者に追加される() {
    MatchRoomService service = new MatchRoomService();
    MatchRoom room = service.createRoom("alice");

    Optional<MatchRoom> joined = service.joinRoom(room.getId(), "bob");

    assertTrue(joined.isPresent());
    assertEquals(List.of("alice", "bob"), joined.get().getParticipants());
  }

  @Test
  void 同じプレイヤーが再度参加しても重複しない() {
    MatchRoomService service = new MatchRoomService();
    MatchRoom room = service.createRoom("alice");

    service.joinRoom(room.getId(), "bob");
    service.joinRoom(room.getId(), "bob");
    service.joinRoom(room.getId(), "alice");

    assertEquals(List.of("alice", "bob"), room.getParticipants());
  }

  @Test
  void 存在しないルームIDには参加できない() {
    MatchRoomService service = new MatchRoomService();

    assertFalse(service.joinRoom("999", "alice").isPresent());
  }
}
