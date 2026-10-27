package oit.is.nekozuki.nekoselect.model;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface PlayerMapper {

  @Select("SELECT username, password_hash AS passwordHash FROM player_accounts WHERE username = #{username}")
  Player findByUsername(@Param("username") String username);

  @Insert("INSERT INTO player_accounts (username, password_hash) VALUES (#{username}, #{passwordHash})")
  void insert(Player player);
}
