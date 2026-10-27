package oit.is.nekozuki.nekoselect.model;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public class MatchRoom {

  private final String id;
  private final Set<String> participants = new LinkedHashSet<>();

  public MatchRoom(String id) {
    this.id = id;
  }

  public String getId() {
    return id;
  }

  // 複数リクエストから同時に参照されるため、参加者の読み書きは同期する
  public synchronized boolean addParticipant(String username) {
    return participants.add(username);
  }

  public synchronized List<String> getParticipants() {
    return new ArrayList<>(participants);
  }
}
