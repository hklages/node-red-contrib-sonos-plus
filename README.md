# node-red-contrib-sonos-plus

Version 2019-08-18T0907

A set of NodeRed nodes to control SONOS player.  

This package uses code from **node-red-contrib-better-sonos**. I created a new package since the former package hasn't been maintained for more then a year.

## Installation

Install directly from your NodeRED's Setting Pallete.

## Special Functions

- Simple SONOS player selection in ConfigNode (recommendation: enter IP address)
- Comfortable selection of My SONOS radio stations (TuneIn, Amazon Prime)
- Supports TuneIn radio id to select radio stations
- Uses the newest node-sonos api (2019-08-18T0925)

## Restrictions

Currently the queue management does not support inserting complete playlists into the SONOS queue. Supported commands are: activate (=play), play next, play previous, flush, get queue, insert one song.

## Functions and Usage

This package provides basic functions for the SONOS player. The functions are grouped into 5 nodes.
- _Config_ node: Select SONOS player
- _Player control_ node: Execute basic SONOS player commands (e.g. play, stop, pause, ..)
- _Get Player status_ node: Get information about current state of SONOS player (e. g. playing, volume, ..)
- _Manage queue_ node: Performs basic queue commands (e. g. activate queue, get queue information)
- _Manage radio_ node: Performs radio commands (e. g activate a TuneIn radio, Amazon Prime radio station)

> It is recommended to assign fixed IP addresses (best in router) to each SONOS player and use these addresses in the configNode.  

## SONOS General Concepts

_SONOS Player_ may **either** play a _stream_ from _radio stations_ or _songs_ (= tracks) from the _SONOS queue_.
- The radio station can be chosen from TuneIn or other services e. g. Amazon Prime.
- Before activating the queue modus the SONOS queue must have been filled with songs. This can be done by chosing songs form different sources (Album, single song) or through playlists and inserting them into the SONOS queue.   

SONOS players may be _grouped_ together (forming a _Zone_) to play the same song/stream in synch. In each group there is exactly one _leading player_. Several commands (play, stop, activate queue, radio, .. )  will impact all group members when having been send to the leading player. Other commands are only SONOS player specific e.g . mute, volume, ...

_My SONOS_ contains shortcuts to different sources and is grouped into Radio stations, Playlists, Album, Songs and My Library. The radio stations are sorted alphabetically.

## Roadmap 2019

-   August: Update to newest version of dependencies (node-sonos) DONE
-   August: Use My_SONOS to select radio stations DONE
-   August: Use TuneIn Radio id to select radio stations DONE
-   August: Improve debugging, logging capabilities
-   September: Fix joinGroup, leaveGroup
-   September/October: Insert a playlist into SONOS queue  
-   Later: Additional functionality: Spotify, ...

## Credentials
- node-red-better-SONOS
- node-sonos api
