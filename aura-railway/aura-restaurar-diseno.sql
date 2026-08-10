-- ============================================================
--  Restaurar diseño Aura (hero oscuro + logo circular)
--  Ejecutar en la base de datos MySQL de Railway.
--  Sobrescribe los valores de content.design.* en la tabla `settings`.
--  Estos valores dejan el diseño en modo dark con el logo Aura.
--  El usuario puede cambiar al modo claro desde el propio admin.
-- ============================================================

-- Marca y colores
INSERT INTO settings (k, v) VALUES ('content.design.brand1', '#ff3b6b')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.brand2', '#ff8a3b')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.bg', '#0e0f14')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.text', '#f2f3f7')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.radius', '18')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- Hero: fondo oscuro sólido (para que resalte el logo Aura)
INSERT INTO settings (k, v) VALUES ('content.design.hero_style', 'solid')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.hero_image', '')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.hero_solid_color', '#0e0f14')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- Fuente y botones
INSERT INTO settings (k, v) VALUES ('content.design.font', 'system')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.btn_style', 'pill')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- Tarjetas y tab-bar (versión dark)
INSERT INTO settings (k, v) VALUES ('content.design.card_radius', '16')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.card_shadow', 'medium')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.card_border', '#1f2130')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.tab_bg', '#0e0f14')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.tab_active', '#ff3b6b')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.tab_inactive', '#9ca3af')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- Chat y match
INSERT INTO settings (k, v) VALUES ('content.design.chat_bubble_style', 'rounded')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.chat_bubble_me', '#ff3b6b')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.chat_bubble_other', '#1a1c26')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.match_overlay', 'gradient')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.match_badge_color', '#ff3b6b')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- Perfil y descubrir
INSERT INTO settings (k, v) VALUES ('content.design.profile_header_style', 'cover')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.profile_accent', '#ff3b6b')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.avatar_shape', 'circle')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.discover_card_style', 'photo-full')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.likes_grid_cols', '2')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- Fondos laterales del escritorio
INSERT INTO settings (k, v) VALUES ('content.design.side_left_bg', 'none')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.side_right_bg', 'none')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- ============================================================
-- LOGO Aura: imagen circular con anillo gradiente rosa→azul
-- ============================================================
INSERT INTO settings (k, v) VALUES ('content.design.logo_mode', 'image')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.logo_image', 'assets/aura-logo.png?v=3')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.logo_image_light', 'assets/aura-logo-light.png?v=3')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.logo_bg', 'gradient')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.logo_color', '#ffffff')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.logo_size', '88')
  ON DUPLICATE KEY UPDATE v = VALUES(v);
INSERT INTO settings (k, v) VALUES ('content.design.logo_radius', '50')
  ON DUPLICATE KEY UPDATE v = VALUES(v);

-- ============================================================
-- Comprobación (opcional): verifica los valores aplicados
-- ============================================================
-- SELECT k, v FROM settings WHERE k LIKE 'content.design.%' ORDER BY k;
