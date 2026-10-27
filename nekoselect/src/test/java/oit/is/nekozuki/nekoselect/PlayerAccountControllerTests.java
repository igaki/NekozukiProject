package oit.is.nekozuki.nekoselect;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

import oit.is.nekozuki.nekoselect.model.Player;
import oit.is.nekozuki.nekoselect.model.PlayerMapper;

@SpringBootTest
@AutoConfigureMockMvc
class PlayerAccountControllerTests {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private PlayerMapper playerMapper;

  @Autowired
  private PasswordEncoder passwordEncoder;

  @Test
  void 登録するとアカウントがDBにハッシュ化して保存される() throws Exception {
    String username = uniqueUsername();

    mockMvc.perform(post("/register").with(csrf()).param("username", username).param("password", "pass"))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/login?registered"));

    Player savedPlayer = playerMapper.findByUsername(username);
    org.junit.jupiter.api.Assertions.assertNotNull(savedPlayer);
    org.junit.jupiter.api.Assertions.assertNotEquals("pass", savedPlayer.getPasswordHash());
    org.junit.jupiter.api.Assertions.assertTrue(passwordEncoder.matches("pass", savedPlayer.getPasswordHash()));
  }

  @Test
  void 重複ユーザー名ではアカウントを増やさずエラーを表示する() throws Exception {
    String username = uniqueUsername();
    Player player = new Player();
    player.setUsername(username);
    player.setPasswordHash(passwordEncoder.encode("pass"));
    playerMapper.insert(player);

    mockMvc.perform(post("/register").with(csrf()).param("username", username).param("password", "pass"))
        .andExpect(status().isOk())
        .andExpect(view().name("register"))
        .andExpect(content().string(containsString("このユーザー名は既に登録されています。")));
  }

  @Test
  void 登録済みプレイヤーは正しい認証情報で保護された対戦URLへ進める() throws Exception {
    String username = uniqueUsername();
    register(username, "pass");

    mockMvc.perform(formLogin().user("username", username).password("pass"))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/match-room"));
  }

  @Test
  void 誤ったパスワードでは認証されずログイン画面にエラーが表示される() throws Exception {
    String username = uniqueUsername();
    register(username, "pass");

    mockMvc.perform(formLogin().user("username", username).password("wrong"))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/login?error"));

    mockMvc.perform(get("/login").param("error", ""))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("ユーザー名またはパスワードが正しくありません。")));
  }

  @Test
  void 未認証では対戦ルームURLからログイン画面へ誘導される() throws Exception {
    mockMvc.perform(get("/match-room"))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/login"));
  }

  @Test
  void 不正なユーザー名と短いパスワードでは登録できない() throws Exception {
    mockMvc.perform(post("/register").with(csrf()).param("username", "bad name").param("password", "pass"))
        .andExpect(status().isOk())
        .andExpect(view().name("register"))
        .andExpect(content().string(containsString("ユーザー名は英数字と_の3〜20文字で入力してください。")));

    mockMvc.perform(post("/register").with(csrf()).param("username", uniqueUsername()).param("password", "123"))
        .andExpect(status().isOk())
        .andExpect(view().name("register"))
        .andExpect(content().string(containsString("パスワードは4文字以上で入力してください。")));
  }

  private void register(String username, String password) {
    Player player = new Player();
    player.setUsername(username);
    player.setPasswordHash(passwordEncoder.encode(password));
    playerMapper.insert(player);
  }

  private String uniqueUsername() {
    return "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 19);
  }
}
