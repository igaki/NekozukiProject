package oit.is.nekozuki.nekoselect.controller;

import java.security.Principal;
import java.util.Optional;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import oit.is.nekozuki.nekoselect.model.MatchRoom;
import oit.is.nekozuki.nekoselect.service.MatchRoomService;

@Controller
@RequestMapping("/match-room")
public class MatchRoomController {

  private final MatchRoomService matchRoomService;

  public MatchRoomController(MatchRoomService matchRoomService) {
    this.matchRoomService = matchRoomService;
  }

  @GetMapping
  public String list(Model model) {
    model.addAttribute("rooms", matchRoomService.listRooms());
    return "match-room";
  }

  @PostMapping
  public String create(Principal principal) {
    MatchRoom room = matchRoomService.createRoom(principal.getName());
    return "redirect:/match-room/" + room.getId();
  }

  // ACにより、リンクを開いた時点で参加する
  @GetMapping("/{id}")
  public String join(@PathVariable String id, Principal principal, Model model,
      RedirectAttributes redirectAttributes) {
    Optional<MatchRoom> room = matchRoomService.joinRoom(id, principal.getName());
    if (room.isEmpty()) {
      redirectAttributes.addFlashAttribute("roomError", "指定されたルームが見つかりません。");
      return "redirect:/match-room";
    }
    model.addAttribute("room", room.get());
    model.addAttribute("participants", room.get().getParticipants());
    return "match-room-detail";
  }
}
