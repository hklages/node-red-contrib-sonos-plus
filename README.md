# node-red-contrib-sonos-plus
[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/dt/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/v/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hklages/node-red-contrib-sonos-plus/master/LICENSE)

A set of NodeRed nodes to control SONOS player in your local WLAN.

This package uses code from **node-red-contrib-better-sonos**. I created this new package since the former package hasn't been maintained for more then a year.

## NEWS
2019-09-12 Insert playlist by name from Amazon Prime, MusicLibrary and Sonos playlists into queue

## Installation

Install directly from your NodeRED's setting pallete.

## Special Functions

- Sonos Player: Simply select SONOS player in ConfigNode by search button (recommendation: enter IP address)
- Stations: Convenient selection of "My Sonos" radio stations from TuneIn, Amazon Prime by name (search string).
- TuneIn radio ID: Select and play TuneIn stations by simply submitting the TuneIn radio id
- Playlists: Convenient selection (and insertion) of My Sonos Music Library  and Sonos playlists by name (search string).
- Playlists: Insert Amazon Prime standard playlists by URI
- Information: Provides many kinds of current song information: artist, title, media information and radio station name

## Restrictions

> When playing a radio station the commands next_song, previous_song may cause an error message as many stations do not support them.

## Nodes

The functions are grouped into 5 nodes.
- _Config_ node: Select SONOS player, stores serial number or IP address
- _Control player_ node: Execute basic SONOS player commands (e.g. play, stop, pause, join/leave group ...)
- _Get status_ node: Get information about current state of SONOS player (e. g. playing, volume, groups, song info, media info, ...)
- _Manage queue_ node: Performs queue performs (e. g. activate queue and start playing, get queue information, insert into queue)
- _Manage radio_ node: Performs radio performs (e. g activate a TuneIn radio, Amazon Prime radio station, ... )

## Usage ...
For more information - also examples - see the [Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos)

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos)
