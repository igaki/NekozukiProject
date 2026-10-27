package oit.is.nekozuki.nekoselect.security;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import oit.is.nekozuki.nekoselect.model.Player;
import oit.is.nekozuki.nekoselect.model.PlayerMapper;

@Service
public class PlayerUserDetailsService implements UserDetailsService {

  private final PlayerMapper playerMapper;

  public PlayerUserDetailsService(PlayerMapper playerMapper) {
    this.playerMapper = playerMapper;
  }

  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    Player player = playerMapper.findByUsername(username);
    if (player == null) {
      throw new UsernameNotFoundException("プレイヤーが見つかりません。");
    }
    return User.withUsername(player.getUsername())
        .password(player.getPasswordHash())
        .roles("PLAYER")
        .build();
  }
}
