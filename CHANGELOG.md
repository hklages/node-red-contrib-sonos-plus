## Changelog

All notable changes to this project are documented in this file.

### [4.5.2] 2020-11-21

#### Changed

- Universal node: household.create.group now supports now alle "letter characters"

- internal: JDoc - more function documented (Helpers, Sonos-Commands)

### [4.5.1] 2020-11-13

#### Changed

- Universal node: group.play.httpstream bug fixed and now with REGEX http check

- Universal node: group.set.queuemode bug fixed

- Universal node: group.adjust.volume now outputs msg.newVolume

- internal: documentation for groupPlayStreamHttpV2, didlXmlToArray, validateConvertToInteger

- internal: Sonos-command revised, code optimization

#### Added

- Universal node: group.get.members

- internal: documentation in .docs - first draft

### [4.5.0] 2020-11-07

#### Changed

- artUri now instead of AlbumArtUri - may break some flows!

- bugfix: sometimes http:// prefix 2 times

- internal: dependencies fs-extra, path removed, eslint update

- internal: all json files are now named Db-xxx.json

- internal: getQueueV2 replaces getPlayerQueue, getMySonosV3 replaces getAllMySonosV2, code refactoring to getSonosPlaylistsV2

- changed some default values (number of items returned)

#### Added

- added music service name to group.get.trackplus and mysonos.get.items

- internal: added list of all actions (currently not used)

### [4.4.0] 2020-11-02

#### Changed

- new action file and executeAction function - all v6: preparing new functions

### [4.3.5] 2020-10-26

#### Changed

- Universal node: internally: SetCrossfade, SetMute, SetLoudness with true instead of 1

- Universal/My Sonos node: Code refactoring and consolidation in Sonos-Commands (mainly related to My-Sonos, Music-Library)

#### Added

- Universal node. player.play.tv let you activate the TV line in at supported players.

### [4.3.4] 2020-10-19

#### Changed

- Universal node: regex for player names changed "A E.r_k-er:1" is now a valid name :-)

### [4.3.3] 2020-10-18

#### Changed

- Universal node: player.get.treble/bass/volume now output string values (not numbers)

- Universal / My Sonos node: for commands instead of help text now the command is displayed

- Helper: REGEX_TIME, REGEX_TIME_DELTA, REGEX_RADIO_ID improved

### [4.3.2] 2020-10-17

#### Changed

- My Sonos node: added library.get.albums

### [4.3.1] 2020-10-15

#### Changed

- renamed Sonos-ActionsV2 to V3 and type small letters!

### [4.3.0] 2020-10-15

#### Changed

- setCmd, getCmd replaced by executeAction, new Sonos-ActionsV3.json file (also clean up)

- removed Control player, Manage Queue node, clean up code!

#### Added

- My sonos node: library.export.album

- Universal node: added household.get.sonosplaylists

- Universal node: group.cancel.sleeptimer

- Universal node: player.execute.action

### [4.2.2] 2020-10-14

#### Changed

- player names in household.create.group may now also include one blank, hyphen (not at beginning / end) and multiple digits

### [4.2.1] 2020-10-04

#### Changed

- dependencies dev - removed some eslint packages

- documentation update

### [4.2.0] 2020-10-03

#### Changed

- dependencies update axio, eslint-plugin-import

- removed node: manage-radio and get_status n

#### Added

- Universal node: new commands household.create.group, household.separate.group, player.become.standalone, coordinator.delegate

### [4.1.4] 2020-09-22

#### Added

- Universal node, command group.create.volumesnap, group.set.volume

### [4.1.3] 2020-09-18

#### Changed

- Universal node, bug fixing night mode, dialog level

### [4.1.2] 2020-08-16

#### Changed

- removed all console.log

- small bug fixing related to baseUrl

- node-sonos now 1.14.0

#### Added

- Universal node: group.get.trackplus with new property stationArtUri (in case of x-sonosapi-stream)

### [4.1.1] 2020-08-13

#### Added

- Universal node: group.get.actions

- Universal node: group.seek.delta

### [4.1.0] 2020-07-02

#### Changed

- category for depreciated nodes is now old-sonosplus, for new sonosplus

- Universal node: group.save.queue now throws an error in case of empty queue (nothing to save)

- Universal/My Sonos node: bug fix ipaddress not show in debug mode

- Universal node: group.get.state information now includes property invisible and does not show invisible player by default

- Universal node: household.get.groups will not show anymore hidden player (such as stereopair)

- Universal node: all commands will throw an error if player is hidden (in msg.playerName, config.node)

- Universal node: renamed speech enhance to dialog level

#### Added

- Universal node: player.set.bass, player.set.treble, player.get.bass, player.get.bass

- Universal node: group.queue.uri and group.queue.urispotify are added

### [4.0.1] 2020-06-18

#### Changed

- bugfix: Volume range now from 0 .. 100

- bugfix: Sonos Arc added to player with TV port

### [4.0.0] 2020-06-09

#### Depreciated

- Usage of nodes "Control Player", "Get Status", "Manage Radio", "Manage Queue" is depreciated. Please use nodes "Universal", "My Sonos".

#### Added

- "Universal" / "My Sonos" node: added selection box for commands, imput field for state; and compatibility mode for old Version 3 flow style.

- "Universal" / "My Sonos" node: added now all missing commands (music library, ... ) from "Control Player", "Get Status", "Manage Radio" node

#### Changed

- In "Universal", "My Sonos" node: According to Node-RED standards msg.payload is now being used for the "message/state" (such as on/off, new volume, uri, ...) and msg.topic for the command. There is a compatibility mode that lets you still use the old style (msg.payload holds the command and msg.topic the state). This mode has to be manually activated in each node (tic box compatibility) and can be used as a work around for some month.

- "My Sonos" node: get_items is now mysonos.get.items, queue is mysonos.queue.item, stream is mysonos.stream.item, export is mysonos.export.item

- "My Sonos" node: export.item outputs now to msg.payload instead to msg.export. Also msg.payload is NOT set to command. You have to select the command.

- "Universal" node: play.export does now expects data in msg.payload instead of msg.export

- "Universal" node: payload of *.get.mutestate/crossfade is now lowercase on/off

- "Universal" node: create.snap mutestate is now lowercase on/off

- "Universal" node: restore.snap mutestate should be now lowercase

- "Universal" node: remove.sonosplaylist changed to household.remove.sonosplaylist

- "Universal" node: group.create.snaps outputs to payload and group.play.snap now expects snap in payload and not in msg.snap!

### [3.1.5] 2020-05-27

#### Changed

- "My Sonos" node: bugfix get.items for Apple playlists

### [3.1.4] 2020-05-19

#### Added

- "My Sonos" node: get.items added radioId for TuneIn stations

- "Universal node": for play.notification changed order volume/play

### [3.1.3] 2020-05-13

#### Added

- "Universal node": player.join.group, player.leave.group documentation

- "Universal node": set/get.sleeptimer, set/get.crossfade, set.queuemode

- "Universal node": play.track, seek, remove.track

- "Universal node": household.get.groups

#### Changed

- "My Sonos" node: bug fix Sonos playlist without AlbumArtURI issue #35

### [3.1.2] 2020-05-05

#### Changed

- "Universal node":  role names now coordinator, joiner, standalone (instead of independent)

- "Universal node": get.state now provides groupName and groupId, bug fix regarding empty topic

- "Universal node": now all group commands may have prefix group. Example group.get.state

- "My Sonos": bug fix: no sonos playlists

#### Added

- "Universal node": player.join.group, player.leave.group

### [3.1.1] 2020-05-02

#### Changed

- bug fix spotifiy region (number format)

- "Universal node": get.state now provides the group members, group size, group volume

### [3.1.0] 2020-04-30

#### Added

- "Universal node": New commands get.trackplus, get.state, adjust/get.volume, player.adjust.volume, set/get.mutestate, player.set/get.mutestate, get.queue, player.get.queue, play.streamhttp, create.snap, play.snap, save.queue, clear.queue, remove.sonosplaylist

#### Changed

- CAUTION: Universal node: play.export by default clears the queue if export.queue is true. Use msg.clearQueue = false to avoid.

- "Universal node": throws error in case of an invalid command (msg.payload)

- "Universal node": command player.get.role also outputs the SONOS player name

- "My Sonos" node: get.items now alos provides the Sonos playlists.

- "Manage Radio": is depreciated - please use Universal node instead.

- more error handling (helper failure, isV...)

### [3.0.2] 2020-04-23

#### Changed

- Control Player: bug fix serialnum

- Helper, error codes: new error handling

### [3.0.1] 2020-04-18

#### Changed

- My Sonos: bug fix in queue, stream. Changed metaData to metadata

### [3.0.0] 2020-04-17

#### Added

- New Universal node: SONOS player names are supported, easier group handling, different kinds of notification

- My Sonos node: new command export.item to export content data of a My Sonos item. That is input to Universal node play.export

#### Changed

- Control player node: play_notification is depreciated. Please use Universal node joiner.play.notification or play.notification

- Control player node: play_noti is depreciated. Please use  Universal node with play.notification

### [2.1.10] 2020-04-09

#### Changes

- My Sonos: bug fix insert_spotify

### [2.1.9] 2020-04-08

#### Changes

- All nodes: bug fixes (get_items)

- Ctrl Player: bug fix set EQ

- Manage Queue: bug fix insert_spotify

- New node-sonos 1.13.0 including bug fixes for error messages and Spotify

### [2.1.8] 2020-04-02

#### Changes

- All nodes: bug fixes: remove_song

### [2.1.7] 2020-03-25

#### Changes

- bug fixes, preparation new play notification

### [2.1.6] 2020-03-20

#### Changes

- Code optimization, preparation for new play notification

### [2.1.5] 2020-03-15

#### Changed

- Updated dependencies

- small bug fixes in documentation

### [2.1.4] 2020-03-09

#### Changed

- Now using VSCode

- Code standardization with ESlint option standard

- Additional dependencies

### [2.1.3] 2020-03-01

#### Changed

- Bug fix separate_stereopair

### [2.1.2] 2020-02-29

#### Changed

- Bug fix get_groups

### [2.1.1] 2020-02-29

#### Changed

- Bug fix and naming create_stereopair, separate_stereopair

### [2.1.0] 2020-02-29

#### Added

- Node "Get Status" command get_properties now has new property msg.uuid (needed for stereopair)
- Node "Control Player" new commands create_stereopair, seperate_stereopair

#### Changed

- CAUTION: In node "Control Player" play, stop, pause, toggleplayback, next_song, previous_song will now throw error message when send to "client" in a group.
- CAUTION: In node "Control Player" msg is not anymore changed. Before msg. payload was set to true.
- CAUTION: In node "Get Status" msg.role - "coordinator" in stead of "master"
- code optimization (use of Helper)

### [2.0.0] 2020-02-22

#### Added

- New node "My Sonos" based on the SONOS App tab "My Sonos"
- My Sonos node: get_items outputs all My Sonos items (except Sonos Favorites, Audible audiobooks, ... )
- My Sonos node: stream stations from Amazon, Napster, TuneIn, Antenna, ....
- My Sonos node: queue playlists, albums, tracks from Spotify, Amazon, Napster, ....

#### Changed

- Error handling revised

### [1.4.0] 2020-02-15

#### Added

- Manage Queue: seek command
- Get Status: get_loudness
- Control Player: set_loudness

#### Changed

- Get Status: get_crossfademode changed to get_crossfade
- Error handling revised (for all direct SOAP calls)
- Several data structures moved into JSON files

### [1.3.0] 2020-02-09

#### Added

- Node Control Player: Added set_sleeptimer
- Node Get Status: Added get_sleeptimer

#### Changed

- Node Get Status: get_songmedia an get_mediainfo now outputs the TuneIn Radio Id
- Node Manage Radio: get_mysonos now outputs station logo
- Error handling revised

### [1.2.0] 2020-02-06

#### Added

- Node Control Player: Added set_eq to set NightMode, DialogLevel, SubGain
- Node Get Status: Added get_crossfademode (On/Off)
- Node Control Player: Added set_crossfademode (On/Off)

#### Changed

- Node Get Status, test_connected provides now msg.info for additional infos if not reachable
- Node Control Player, set_led now does not change msg (before payload was set to true)
- Helper Code revised
- Error handling revised

### [1.1.0] 2020-02-01

#### Added

- Node Get Status: New get_eq to get information about NightMode, DialogLevel, GainSub, ...
- Node Get Status: New command get_groups to provide information about the topology, groups, members in groups
- Node Get Status: New msg.suppressWarnings for get_songmedia, get_songinfo to suppress warnings

#### Changed

- Dependencies: updated

### [1.0.1] 2019-12-12

#### Changed

- Manage Queue: remove_song got property "numberOfSongs" to specify the number of songs to be removed.

### [1.0.0] 2019-11-30 Caution: last published release was 0.5.1

#### Changed

- Manage Queue: Removed output property queue_length, available_playlists (not necessary)

#### Added

- Manage Queue: Support for Spotify: tracks, album, playlists from My Sonos or direct insertion
- Get Status: Added test_connected command to check whether player is reachable.
- Control Player: Now with output to be able to chain commands
- Manage Radio: play_httpradio for using simple http stream address

### [0.8.0] 2019-11-11  (not published)

#### Changed

- revised Manage Radio node
- moved command get_mysonosall to node Get Status as get_mysonos
- revised all modules - consistent coding, html, ...

### [0.7.0] 2019-11-08 (not published)

#### Changed

- revised Configuration Node and Helper.
- coding clean up in all modules, especially in SonosHelper

### [0.6.0] 2019-11-05 (not published)

#### Changed

- rework node Get Status Node !! changes some commands and properties
- Get Status node: get_state replacing get_stateonly
- Get Status node: get_name replacing get_sonosname
- Several output properties changed: camelCase
- Get Status Node: msg.name instead of msg.sonosName
- Get Status Node: msg.group instead of msg.sonosGroup
- Get Status Node: msg.volumeNormalized instead of msg.normalized_volume
- Get Status Node: msg.queueActivated instead of msg.queue_active

#### Added

- Get Status Node: get_led provides the state of the LED

### [0.5.1] 2019-11-03

#### Changed

- bug fix in manage radio node: play_mysonos does not output msg

### [0.5.0] 2019-11-02

### Addded

- added: set_led with topic On or Off to set the LED light
- added msg.size for insert_sonos_playlist, get_sonos_playlists
- added insert_amazonprime_playlist to search in My Sonos

#### Changed in managed queue node

- play_song now automatically activates queue.
- replacing get_prime_playlists by get_amazonprime_playlists
- replacing insert_prime_playlist by insert_prime_playlisturi
- rework of async chains, more validation and error handling
- in manage queue node: shorter error messages

### Removed

- in control player node: removed lab_play_notification -> use play_notification

### [0.4.8] 2019-10-26

#### Changed

- added msg.size for insert_musiclibrary_playlist, get_musiclibrary_playlists
- code: Added a warning, if there might be more playlists in Music Library then having been fetched
- code: more validation and error handling

### [0.4.7] 2019-10-21

#### Changed

- code: get_mysonos, play_mysonos with more validation, debugging and ignoring items with missing uri

### [0.4.6] 2019-10-20

#### Changed

- code: get_mysonos with more validation and debugging

### [0.4.5] 2019-10-18

#### Added

- play, activate_avtransport, activate_queue, play_mysonos, play_tunein with optional msg.volume
- option to "catch" node to handle errors

#### Changed

- code: changed validation of input (avoiding NaN) and error, warning message
- code: bug fixing

### [0.4.4] 2019-10-01

#### Added

- play_notification with option to set notification volume

#### Changed

- code: more input verification (error handling)

### [0.4.3] 2019-09-18

#### Added

- get_queuemode and set_queuemode: SHUFFLE, NORMAL, ....
- More Wiki examples

#### Changed

- code more readable (.then, .catch), more error handling, coding standard
- Wiki reviesed, added URI information

### [0.4.2] 2019-09-12

#### Changed

- if title, artist could not be identified now only warning and no output (instead of error)

#### Added

- more examples in Wiki
- Manage queue node: insert_musiclibrary_playlist, insert_sonos_playlist, insert_prime_playlist, get_musicLibrary_playlists

### [0.4.0] - 2019-09-06

#### Changed

- code subdirectory to src
- play_song now verifies position but still does not check queue activated
- activate queue now checks whether queue is empty
- node documentation update, readme update, changelog update

#### Added

- Control player node: activate_avtransport - to activate a specific stream (such as line in)
- Get status node: get_properties: list all player properties (ip, mac, deviceType, ...)
- Get status node: get_state, get_volume, get_muted, get_name: output to payload
- Manage queue node: remove_song: removes a song from the queue
- Control player Lab function play notification

### [0.3.7] - 2019-09-03

#### Added

- manage queue node: get_prime_playlists
- get status node: get_songinfo, get_mediainfo, get_positioninfo
- manage radio node: get_mysonosall (may be changed in the future)

#### Changed

- Update to Node-Sonos 1.12.3

### [0.3.6] - 2019-08-28

### Fixed

- reviesed node documentation
- fixed some documentation errors (get_songmedia)

#### Changed

- Wiki documentation now cover the full scope and has more complex examples

### [0.3.5] - 2019-08-27T1623

#### Fixed

- error in documentation for node "get status"

#### Added

- Link to Wiki - new Examples

#### Changed

- Some messages

### [0.3.4] - 2019-08-26T1615

#### Added

- manage queue node: new command "get_sonos_playlists"
- example to insert a playlist into the SONOS queue

#### Changed

- get queue node: now all commands will send message as output (if no error)

- Color of nodes

#### Fixed

- get_queue now provides output message even if albumArtURL could not be found

### [0.3.3] - 2019-08-24T2200

#### Added

- CHANGELOG.md
- Wiki first page

#### Changed

- Status and error messages have been standardized in all nodes
- Now debug messages instead of info messages (keep log clean)
- README: moved some stuff to Wiki

#### Removed

- nothing

#### Fixed

- error handling when IP address points to non SONOS device
- bug in get queue. It works now for empty queue.

### [0.3.2] - 2019-08-21

#### Added

- ip address syntax check in configNode

### [0.3.1] - 2019-08-21
