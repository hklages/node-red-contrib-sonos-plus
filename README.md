# node-red-contrib-sonos-plus

Version 2019-08-18T2031

A set of NodeRed nodes to control SONOS player.  

This package uses code from **node-red-contrib-better-sonos**. I created a new package since the former package hasn't been maintained for more then a year.

## Installation

Install directly from your NodeRED's setting pallete.

## Special Functions

- Simple SONOS player selection in ConfigNode (recommendation: enter IP address)
- Comfortable selection of My SONOS radio stations (TuneIn, Amazon Prime)
- Supports TuneIn radio id to select radio stations
- Provides many kinds of current song information: artist, title but also radio station name
- Uses the newest node-sonos api (2019-08-18T0925)

## Restrictions

Currently the queue management does not support inserting complete playlists into the SONOS queue. Supported commands are: activate (=play), play next, play previous, flush, get queue, insert one song.

## Functions and Usage

The functions are grouped into 5 nodes.
- _Config_ node: Select SONOS player, stores serialnumber or IP address
- _Player control_ node: Execute basic SONOS player commands (e.g. play, stop, pause, ..)
- _Get player status_ node: Get information about current state of SONOS player (e. g. playing, volume, ..)
- _Manage queue_ node: Performs basic queue commands (e. g. activate queue, get queue information)
- _Manage radio_ node: Performs radio commands (e. g activate a TuneIn radio, Amazon Prime radio station)

> It is recommended to assign static IP addresses (best in your router) to each SONOS player and use these addresses in the configNode.  

## SONOS General Concepts

**SONOS Player** may either(!) play a **stream** from **radio stations** or **songs** (= tracks) from the **SONOS queue**.
- The radio station can be chosen from TuneIn or other services e. g. Amazon Prime. When choosen they start to play.
- Before activating the queue modus the SONOS queue must have been filled with songs. This can be done by chosing songs form different sources (Album, single song) or through playlists and inserting them into the SONOS queue.   

SONOS players may be **grouped** together (forming a **Zone**) to play the same song/stream in synch. In each group there is exactly one **leading player**. Several commands (play, stop, activate queue, radio, .. )  will impact all group members when having been send to the leading player. Other commands are only SONOS player specific e.g . mute, volume, ...

**My SONOS** contains shortcuts to different sources and is grouped into Radio stations, Playlists, Album, Songs and My Library. The radio stations are sorted alphabetically.

## Roadmap

- 2019-08: Update to newest version of dependencies (node-sonos) DONE
- 2019-08: Use My_SONOS to select radio stations DONE
- 2019-08: Use TuneIn Radio id to select radio stations DONE
- 2019-08: Improve debugging, logging capabilities
- 2019-08: Fix joinGroup, leaveGroup and
- 2019-09/10: Insert a playlist into SONOS queue  
- 2019/2020: Spotify, ...

## Examples

![Examples](https://raw.github.com/hklages/node-red-contrib-sonos-plus/master/Examples.png "Examples")

## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos)

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos)
