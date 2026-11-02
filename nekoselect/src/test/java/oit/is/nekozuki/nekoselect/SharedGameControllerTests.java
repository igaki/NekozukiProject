package oit.is.nekozuki.nekoselect;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class SharedGameControllerTests {

  @Autowired
  private MockMvc mockMvc;

  @Test
  void ゲーム画面を開くと準備状態になり最後の参加者でカウントダウンが始まる() throws Exception {
    String owner = uniqueName();
    String guest = uniqueName();
    String roomUrl = createRoom(owner);
    String roomId = roomUrl.substring(roomUrl.lastIndexOf('/') + 1);
    mockMvc.perform(get(roomUrl).with(user(guest))).andExpect(status().isOk());

    mockMvc.perform(get(roomUrl + "/game").with(user(owner)))
        .andExpect(status().isOk())
        .andExpect(view().name("shared-game"))
        .andExpect(content().string(containsString("1 / 2")))
        .andExpect(content().string(containsString(">？</button>")))
        .andExpect(content().string(not(containsString(">ねこ</button>"))))
        .andExpect(content().string(not(containsString(">ぬこ</button>"))));

    mockMvc.perform(get(roomUrl + "/game").with(user(guest)))
        .andExpect(status().isOk())
        .andExpect(view().name("shared-game"))
        .andExpect(content().string(containsString("2 / 2")));

    mockMvc.perform(get("/match-room/{id}/game/state", roomId).with(user(owner)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.phase").value("COUNTDOWN"))
        .andExpect(jsonPath("$.readyCount").value(2))
        .andExpect(jsonPath("$.tiles[0].type").value(nullValue()))
        .andExpect(jsonPath("$.tiles.length()").value(12));
  }

  @Test
  void 参加者が一人の間は画面に追加参加者を待つ状態を表示する() throws Exception {
    String owner = uniqueName();
    String roomUrl = createRoom(owner);
    String roomId = roomUrl.substring(roomUrl.lastIndexOf('/') + 1);

    mockMvc.perform(get(roomUrl + "/game").with(user(owner)))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("参加者が2人以上になるまで開始を待っています。")));

    mockMvc.perform(get("/match-room/{id}/game/state", roomId).with(user(owner)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.phase").value("WAITING_FOR_PLAYERS"))
        .andExpect(jsonPath("$.participantCount").value(1));
  }

  @Test
  void カウントダウン中のクリックは取得扱いにならない() throws Exception {
    String owner = uniqueName();
    String guest = uniqueName();
    String roomUrl = createRoom(owner);
    String roomId = roomUrl.substring(roomUrl.lastIndexOf('/') + 1);
    mockMvc.perform(get(roomUrl).with(user(guest)));
    mockMvc.perform(get(roomUrl + "/game").with(user(owner)));
    mockMvc.perform(get(roomUrl + "/game").with(user(guest)));
    mockMvc.perform(get("/match-room/{id}/game/state", roomId).with(user(owner)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.phase").value("COUNTDOWN"));
    String tileId = "tile-1";

    mockMvc.perform(post("/match-room/{id}/game/tiles/{tileId}/click", roomId, tileId)
        .with(user(owner)).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.outcome").value("GAME_NOT_ACTIVE"));
  }

  @Test
  void 参加者以外はゲーム状態を取得できず未ログイン利用者はログインへ誘導される() throws Exception {
    String owner = uniqueName();
    String roomUrl = createRoom(owner);
    String roomId = roomUrl.substring(roomUrl.lastIndexOf('/') + 1);

    mockMvc.perform(get("/match-room/{id}/game/state", roomId).with(user(uniqueName())))
        .andExpect(status().isNotFound());
    mockMvc.perform(get(roomUrl + "/game"))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/login"));
  }

  private String createRoom(String owner) throws Exception {
    MvcResult result = mockMvc.perform(post("/match-room").with(csrf()).with(user(owner)))
        .andExpect(status().is3xxRedirection())
        .andReturn();
    return result.getResponse().getRedirectedUrl();
  }

  private String uniqueName() {
    return "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 19);
  }
}
