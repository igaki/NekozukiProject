package oit.is.nekozuki.nekoselect.controller;

import java.security.Principal;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import oit.is.nekozuki.nekoselect.service.SharedGameService;
import oit.is.nekozuki.nekoselect.service.SharedGameService.ClickResult;
import oit.is.nekozuki.nekoselect.service.SharedGameService.GameView;

@Controller
@RequestMapping("/match-room/{roomId}/game")
public class SharedGameController {

  private final SharedGameService sharedGameService;

  public SharedGameController(SharedGameService sharedGameService) {
    this.sharedGameService = sharedGameService;
  }

  @GetMapping
  public String open(@PathVariable String roomId, Principal principal, Model model) {
    Optional<GameView> game = sharedGameService.openGame(roomId, principal.getName());
    if (game.isEmpty()) {
      return "redirect:/match-room";
    }
    model.addAttribute("roomId", roomId);
    model.addAttribute("game", game.get());
    return "shared-game";
  }

  @GetMapping("/state")
  @ResponseBody
  public ResponseEntity<GameView> state(@PathVariable String roomId, Principal principal) {
    return sharedGameService.getState(roomId, principal.getName())
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
  }

  @PostMapping("/tiles/{tileId}/click")
  @ResponseBody
  public ResponseEntity<ClickResult> click(@PathVariable String roomId, @PathVariable String tileId,
      Principal principal) {
    return sharedGameService.click(roomId, principal.getName(), tileId)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
  }
}
