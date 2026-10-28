package oit.is.nekozuki.nekoselect.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Service;

import oit.is.nekozuki.nekoselect.model.MatchRoom;

@Service
public class MatchRoomService {

  private final AtomicLong nextId = new AtomicLong(1);
  private final Map<String, MatchRoom> rooms = new ConcurrentHashMap<>();

  public MatchRoom createRoom(String username) {
    MatchRoom room = new MatchRoom(String.valueOf(nextId.getAndIncrement()));
    room.addParticipant(username);
    rooms.put(room.getId(), room);
    return room;
  }

  public List<MatchRoom> listRooms() {
    List<MatchRoom> result = new ArrayList<>();
    for (MatchRoom room : rooms.values()) {
      if (!room.getParticipants().isEmpty()) {
        result.add(room);
      }
    }
    result.sort((a, b) -> Long.compare(Long.parseLong(a.getId()), Long.parseLong(b.getId())));
    return result;
  }

  public Optional<MatchRoom> findRoom(String id) {
    return Optional.ofNullable(rooms.get(id));
  }

  public Optional<MatchRoom> joinRoom(String id, String username) {
    Optional<MatchRoom> room = findRoom(id);
    room.ifPresent(found -> found.addParticipant(username));
    return room;
  }
}
