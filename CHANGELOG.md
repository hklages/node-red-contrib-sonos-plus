# Changelog
All notable changes to this project will be documented in this file.

## [0.3.4] - not yet published
### Added
- get queue node: new command "get_sonos_playlists"
- example to insert a playlist into the SONOS queue

### Changed
- get queue node: now all commands will send message as output (if no error)
- Color of nodes

### Fixed
- get_queue now provides message even if albumArtURL could not be found

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
