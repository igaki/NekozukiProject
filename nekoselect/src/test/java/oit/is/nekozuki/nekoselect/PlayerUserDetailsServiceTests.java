package oit.is.nekozuki.nekoselect;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;

import oit.is.nekozuki.nekoselect.model.Player;
import oit.is.nekozuki.nekoselect.model.PlayerMapper;
import oit.is.nekozuki.nekoselect.security.PlayerUserDetailsService;

@SpringBootTest
class PlayerUserDetailsServiceTests {

  @Autowired
  private PlayerUserDetailsService userDetailsService;

  @Autowired
  private PlayerMapper playerMapper;

  @Autowired
  private PasswordEncoder passwordEncoder;

  @Test
  void DBにあるプレイヤーを認証情報として検索する() {
    String username = "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 19);
    String passwordHash = passwordEncoder.encode("pass");
    Player player = new Player();
    player.setUsername(username);
    player.setPasswordHash(passwordHash);
    playerMapper.insert(player);

    UserDetails userDetails = userDetailsService.loadUserByUsername(username);

    assertEquals(username, userDetails.getUsername());
    assertEquals(passwordHash, userDetails.getPassword());
    assertEquals("ROLE_PLAYER", userDetails.getAuthorities().iterator().next().getAuthority());
  }

  @Test
  void 存在しないユーザー名は例外になる() {
    assertThrows(UsernameNotFoundException.class,
        () -> userDetailsService.loadUserByUsername(uniqueUsername()));
  }

  private String uniqueUsername() {
    return "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 19);
  }
}
