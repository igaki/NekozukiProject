package oit.is.nekozuki.nekoselect.controller;

import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import oit.is.nekozuki.nekoselect.model.Player;
import oit.is.nekozuki.nekoselect.model.PlayerMapper;

@Controller
public class PlayerAccountController {

  private static final Pattern USERNAME_PATTERN = Pattern.compile("[A-Za-z0-9_]{3,20}");

  private final PlayerMapper playerMapper;
  private final PasswordEncoder passwordEncoder;

  public PlayerAccountController(PlayerMapper playerMapper, PasswordEncoder passwordEncoder) {
    this.playerMapper = playerMapper;
    this.passwordEncoder = passwordEncoder;
  }

  @GetMapping("/register")
  public String registerForm() {
    return "register";
  }

  @GetMapping("/login")
  public String loginForm(@RequestParam(required = false) String error, Model model) {
    if (error != null) {
      model.addAttribute("loginError", "ユーザー名またはパスワードが正しくありません。");
    }
    return "register";
  }

  @PostMapping("/register")
  public String register(@RequestParam(required = false) String username,
      @RequestParam(required = false) String password, Model model) {
    if (username == null || !USERNAME_PATTERN.matcher(username).matches()) {
      model.addAttribute("error", "ユーザー名は英数字と_の3〜20文字で入力してください。");
      return "register";
    }
    if (password == null || password.length() < 4) {
      model.addAttribute("error", "パスワードは4文字以上で入力してください。");
      return "register";
    }
    if (playerMapper.findByUsername(username) != null) {
      model.addAttribute("error", "このユーザー名は既に登録されています。");
      return "register";
    }

    Player player = new Player();
    player.setUsername(username);
    player.setPasswordHash(passwordEncoder.encode(password));
    try {
      playerMapper.insert(player);
    } catch (DataIntegrityViolationException exception) {
      model.addAttribute("error", "このユーザー名は既に登録されています。");
      return "register";
    }
    return "redirect:/login?registered";
  }
}
