# System Cleanup Report

Date: 2026-04-02

Conservative inventory only. No game data, app bundles, or APT source files were removed as part of this report.

## APT sources

Active:
- `/etc/apt/sources.list.d/docker.list` — оставить
- `/etc/apt/sources.list.d/kisak-ubuntu-kisak-mesa-noble.sources` — оставить
- `/etc/apt/sources.list.d/ubuntu.sources` — оставить

Backups:
- `/etc/apt/sources.list.d/docker.list.save` — кандидат на удаление
- `/etc/apt/sources.list.d/kisak-ubuntu-kisak-mesa-noble.sources.save` — кандидат на удаление
- `/etc/apt/sources.list.d/lutris-team-ubuntu-lutris-noble.sources.save` — кандидат на удаление
- `/etc/apt/sources.list.d/ubuntu.sources.save` — кандидат на удаление
- `/etc/apt/sources.list.d/ubuntu.sources.curtin.orig` — требует отдельного решения

Disabled:
- `/etc/apt/sources.list.d/lutris-team-ubuntu-lutris-noble.sources.disabled` — оставить
  Оставлен как быстрый откат для PPA `lutris-team`, но не участвует в текущем `apt`.

Verification:
- `apt-cache policy lutris` показывает `Installed: 0.5.14-2`
- `apt-cache policy lutris` показывает `Candidate: 0.5.14-2`

## Applications / .local

Applications:
- `~/Applications/LM-Studio-0.4.8-x64.AppImage` — оставить
  Используется активным процессом и ярлыком `~/Desktop/LM Studio.desktop`.
- `~/Applications/lm-studio.png` — оставить
  Используется ярлыком `~/Desktop/LM Studio.desktop`.

Desktop entries in `~/.local/share/applications`:
- `net.lutris.world-of-warcraft-wrath-of-the-lich-king-1.desktop` — оставить
  Рабочий ярлык `Lutris` через `lutris:rungameid/1`.
- `stirling-pdf.desktop` — оставить
  Ярлык указывает на валидную команду.
- `RPCS3/RPCS3.desktop` — кандидат на удаление
  `Exec` указывает на отсутствующий файл `~/.local/share/lutris/runners/rpcs3/rpcs3-v0.0.27-14945-47da39a2_linux64.AppImage`.
- `discord-424004941485572097.desktop` — кандидат на удаление
  Ярлык выглядит битым и явно неверным: `Exec=/tmp/.mount_PfMRR759/usr/bin/rpcs3 %u`.
  Это временный путь из `/tmp`, который не должен использоваться как постоянный launcher для Discord.

Local share overview:
- `~/.local/share/lutris` — 1.4G — оставить
  Это активные данные `Lutris`, включая конфиги игры и раннеры.
- `~/.local/share/umu` — 772M — оставить
  Это установленный `umu/steamrt3`, используемый `Lutris` для Proton-совместимого запуска.
- `~/.local/share/applications` — 28K — оставить
  Маленький каталог, но содержит два явных устаревших launcher-файла выше.

## Games

Detected copies:
- `~/Games/world-of-warcraft-wrath-of-the-lich-king` — 25G — оставить
- `~/Games/World of Warcraft 3.3.5a` — 25G — оставить

Lutris binding:
- `Lutris` сейчас привязан к `~/Games/world-of-warcraft-wrath-of-the-lich-king`
- Источник: `~/.local/share/lutris/games/world-of-warcraft-wrath-of-th-warmane-copies-the-g-1775141531.yml`

User data locations:
- В копии `Lutris` пользовательские данные лежат в:
  `drive_c/world_of_warcraft_wrath_of_the_lich_king/WTF`
  `drive_c/world_of_warcraft_wrath_of_the_lich_king/Interface`
  `drive_c/world_of_warcraft_wrath_of_the_lich_king/Cache`
  `drive_c/world_of_warcraft_wrath_of_the_lich_king/Screenshots`
- В standalone-копии пользовательские данные лежат в:
  `~/Games/World of Warcraft 3.3.5a/WTF`
  `~/Games/World of Warcraft 3.3.5a/Interface`
  `~/Games/World of Warcraft 3.3.5a/Cache`
  `~/Games/World of Warcraft 3.3.5a/Screenshots`

Structure comparison:
- Верхний уровень у обеих копий совпадает по именам файлов и каталогов
- В обеих копиях есть:
  `Data`, `Logs`, `Errors`, `WTF`, `Interface`, `Cache`, `Screenshots`, `Wow.exe`, `Launcher.exe`
- На текущем этапе это выглядит как осознанно сохранённый дубль, а не как повреждённая неполная копия

Status summary:
- Обе WoW-копии — требует отдельного решения
  Удалять одну из них без отдельной сверки содержимого пользовательских папок нельзя.
- Связанный `Lutris` prefix — оставить
  Он является текущей рабочей точкой интеграции с `Lutris`.

## Recommended next cleanup

Safe next candidates if you want a second cleanup pass:
- удалить `~/.local/share/applications/RPCS3/RPCS3.desktop`
- удалить `~/.local/share/applications/discord-424004941485572097.desktop`
- удалить `.save` файлы в `/etc/apt/sources.list.d`

Items that should wait for a separate decision:
- `ubuntu.sources.curtin.orig`
- одна из двух копий `World of Warcraft`
- `lutris-team-ubuntu-lutris-noble.sources.disabled`
