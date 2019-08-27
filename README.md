# node-red-contrib-sonos-plus

Version 2019-08-27T1619

A set of NodeRed nodes to control SONOS player in your local WLAN.

This package uses code from **node-red-contrib-better-sonos**. I created this new package since the former package hasn't been maintained for more then a year.

## NEWS
2019-08-27 fixed bug in documentation "get status" node, minor changes, added Wiki link
2019-08-26 Insert SONOS playlist to queue and play songs now possible

## Installation

Install directly from your NodeRED's setting pallete.

## Special Functions

- Simple SONOS player selection in ConfigNode (recommendation: enter IP address)
- Comfortable selection of My SONOS radio stations (TuneIn, Amazon Prime) by search string.
- Supports TuneIn radio id to select and play radio stations
- Provides many kinds of current song information: artist, title, media information and radio station name
- Supports Sonos playlists: Can be inserted into queue
- Uses the newest node-sonos api (2019-08-18T0925)

## Restrictions

> When playing a radio station the commands next_song, previous_song may cause a warning as many stations do not support them.

> Amazon, ... playlist can not be activated directly.

## Functions and Usage

The functions are grouped into 5 nodes.
- _Config_ node: Select SONOS player, stores serialnumber or IP address
- _Control player_ node: Execute basic SONOS player commands (e.g. play, stop, pause, join/leave group ...)
- _Get status_ node: Get information about current state of SONOS player (e. g. playing, volume, groups, song info ...)
- _Manage queue_ node: Performs basic queue commands (e. g. activate queue and start playing, get queue information)
- _Manage radio_ node: Performs radio commands (e. g activate a TuneIn radio, Amazon Prime radio station)

## EXAMPLES, RECOMMENDATIONS, SONOS GENERAL Concept
[Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

## Roadmap

- 2019-08: Update to newest version of dependencies (node-sonos) DONE
- 2019-08: Use My_SONOS to select radio stations DONE
- 2019-08: Use TuneIn Radio id to select radio stations DONE
- 2019-08: Improve debugging, logging capabilities DONE
- 2019-08: Fix join_group, leave_group and get group information DONE
- 2019-09/10: Insert a playlist into SONOS queue  DONE
- 2019-10 Insert Amazon playlist
- 2019/2020: Insert AMAZON Playlist, Spotifiy, ...

## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos)

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos)
