# Changelog
All notable changes to this project will be documented in this file.

## [0.4.4] 2019-10-02
### Added
- set_notification with option to set notification volume

### Changed
- code: more input verification (error handling)

## [0.4.3] 2019-09-18
### Added
- get_queuemode and set_queuemode: SHUFFLE, NORMAL, ....
- More Wiki examples

### Changed
- code more readable (.then, .catch), more error handling, coding standard
- Wiki overwork, added URI information

## [0.4.2] 2019-09-12
### Changed
- if title, artist could not be identified now only warning and no output (instead of error)

### Added
- more examples in Wiki
- Manage queue node: insert_musiclibrary_playlist, insert_sonos_playlist, insert_prime_playlist, get_musicLibrary_playlists

## [0.4.0] - 2019-09-06
### Changed
- code subdirectory to src
- play_song now verifies position but still does not check queue activated
- activate queue now checks whether queue is empty
- node documentation update, readme update, changelog update

### Added
- Control player node: activate_avtransport - to activate a specific stream (e.g. line in)
- Get status node: get_properties: list all player properties (ip, mac, deviceType, ...)
- Get status node: get_state, get_volume, get_muted, get_name: output to payload
- Manage queue node: remove_song: removes a song from the queue
- Control player Lab function play notification

## [0.3.7] - 2019-09-03
### Added
- manage queue node: get_prime_playlists
- get status node: get_songinfo, get_mediainfo, get_positioninfo
- manage radio node: get_mysonosall (may be changed in the future)

### Changed
- Update to Node-Sonos 1.12.3

## [0.3.6] - 2019-08-28
### Fixed
- overwork node documentation
- fixed some documentation errors (get_songmedia)

### Changed
- Wiki documentation now cover the full scope and has more complex examples

## [0.3.5] - 2019-08-27T1623
### Fixed
- error in documentation for node "get status"

### Added
- Link to Wiki - new Examples

### Changed
- Some messages

## [0.3.4] - 2019-08-26T1615
### Added
- manage queue node: new command "get_sonos_playlists"
- example to insert a playlist into the SONOS queue

### Changed
- get queue node: now all commands will send message as output (if no error)
- Color of nodes

### Fixed
- get_queue now provides output message even if albumArtURL could not be found

## [0.3.3] - 2019-08-24T2200
### Added
- CHANGELOG.md
- Wiki first page

### Changed
- Status and error messages have been standardized in all nodes
- Now debug messages instead of info messages (keep log clean)
- README: moved some stuff to Wiki

### Removed
- nothing

### Fixed
- error handling when IP address points to non SONOS device
- bug in get queue. It works now for empty queue.

## [0.3.2] - 2019-08-21
### Added
- ip address syntax check in configNode

## [0.3.1] - 2019-08-21
