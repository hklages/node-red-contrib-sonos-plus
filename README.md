# node-red-contrib-sonos-plus
[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![NPM version][npm-version-image]][npm-url]
[![NPM downloads per month][npm-downloads-month-image]][npm-url]
[![MIT License][license-image]][license-url]
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

A set of NodeRed nodes to control SONOS player in your local WLAN.

This package uses code from **node-red-contrib-better-sonos**. I created this new package since the former package hasn't been maintained for more then a year.

## NEWS
2019-09-02 a few new commands - get_songinfo, ....

## Installation

Install directly from your NodeRED's setting pallete.

## Special Functions

- Simple SONOS player selection in ConfigNode (recommendation: enter IP address)
- Comfortable selection of My SONOS radio stations from TuneIn, Amazon Prime by search string.
- Supports TuneIn radio id to select and play radio stations
- Provides many kinds of current song information: artist, title, media information and radio station name
- Supports Sonos playlists: Can be inserted into queue
- Uses the newest node-sonos api (2019-09-02T0722)

## Restrictions

> When playing a radio station the commands next_song, previous_song may cause an error message as many stations do not support them.

> Amazon, ... playlist can not yet be activated directly.

## Nodes

The functions are grouped into 5 nodes.
- _Config_ node: Select SONOS player, stores serial number or IP address
- _Control player_ node: Execute basic SONOS player commands (e.g. play, stop, pause, join/leave group ...)
- _Get status_ node: Get information about current state of SONOS player (e. g. playing, volume, groups, song info ...)
- _Manage queue_ node: Performs basic queue commands (e. g. activate queue and start playing, get queue information)
- _Manage radio_ node: Performs radio commands (e. g activate a TuneIn radio, Amazon Prime radio station)

## Usage, Recommendations, more information see the Wiki
[Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos)

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos)
