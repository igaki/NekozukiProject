package oit.is.nekozuki.nekoselect;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.flash;
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
class MatchRoomControllerTests {

  @Autowired
  private MockMvc mockMvc;

  @Test
  void ルームを作成すると作成者が参加者として表示される() throws Exception {
    String owner = uniqueName();

    String roomUrl = createRoom(owner);

    mockMvc.perform(get(roomUrl).with(user(owner)))
        .andExpect(status().isOk())
        .andExpect(view().name("match-room-detail"))
        .andExpect(content().string(containsString(owner)));
  }

  @Test
  void ルーム一覧に参加者名つきのルームリンクが表示される() throws Exception {
    String owner = uniqueName();
    String roomUrl = createRoom(owner);

    mockMvc.perform(get("/match-room").with(user(uniqueName())))
        .andExpect(status().isOk())
        .andExpect(view().name("match-room"))
        .andExpect(content().string(containsString("href=\"" + roomUrl + "\"")))
        .andExpect(content().string(containsString(owner)));
  }

  @Test
  void 別のプレイヤーがリンクを開くと参加者に追加され全員に同じ一覧が表示される() throws Exception {
    String owner = uniqueName();
    String guest = uniqueName();
    String roomUrl = createRoom(owner);

    mockMvc.perform(get(roomUrl).with(user(guest)))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString(guest)));

    mockMvc.perform(get(roomUrl).with(user(owner)))
        .andExpect(content().string(containsString(owner)))
        .andExpect(content().string(containsString(guest)));
  }

  @Test
  void 同じルームのリンクを再度開いても参加者が重複しない() throws Exception {
    String owner = uniqueName();
    String guest = uniqueName();
    String roomUrl = createRoom(owner);

    mockMvc.perform(get(roomUrl).with(user(guest)));
    MvcResult result = mockMvc.perform(get(roomUrl).with(user(guest))).andReturn();

    String body = result.getResponse().getContentAsString();
    org.junit.jupiter.api.Assertions.assertEquals(1, countOccurrences(body, guest));
  }

  @Test
  void 存在しないルームIDではルーム一覧へ戻りメッセージが表示される() throws Exception {
    mockMvc.perform(get("/match-room/not-exist").with(user(uniqueName())))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/match-room"))
        .andExpect(flash().attribute("roomError", "指定されたルームが見つかりません。"));
  }

  @Test
  void 未ログインではルーム一覧とルーム画面とルーム作成がログイン画面へ誘導される() throws Exception {
    mockMvc.perform(get("/match-room"))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/login"));
    mockMvc.perform(get("/match-room/1"))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/login"));
    mockMvc.perform(post("/match-room").with(csrf()))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/login"));
  }

  @Test
  void ルーム一覧は未参加者の名前を含まない() throws Exception {
    String stranger = uniqueName();

    mockMvc.perform(get("/match-room").with(user(stranger)))
        .andExpect(content().string(not(containsString(stranger))));
  }

  private String createRoom(String owner) throws Exception {
    MvcResult result = mockMvc.perform(post("/match-room").with(csrf()).with(user(owner)))
        .andExpect(status().is3xxRedirection())
        .andReturn();
    return result.getResponse().getRedirectedUrl();
  }

  private int countOccurrences(String text, String word) {
    int count = 0;
    int index = text.indexOf(word);
    while (index >= 0) {
      count++;
      index = text.indexOf(word, index + word.length());
    }
    return count;
  }

  private String uniqueName() {
    return "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 19);
  }
}
