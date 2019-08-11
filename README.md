# node-red-contrib-h59k-sonos

Version 2019-08-10 beta-2

A set of NodeRed nodes to control Sonos players.  

This is based on the **node-red-contrib-better-sonos** since the authors have stopped working on it.

## Installation

Install directly from your NodeRED's Setting Pallete
or
Change your working directory to your node red installation. Usually it's in ~/.node-red.

`npm install node-red-contrib-h59k-sonos`

## Functions
- config node: simple player selection rather than entering IP Address manually
- control node: play, stop, pause, toggleplayback, next, previous, mute, unmute, +Number (default 8), -Number (default 5), Number (default 10)
- status node: .....
- get-queue node:  .....
- queue node: ....

## Roadmap 2019

-   August: **Update** to newest version of dependencies (node-sonos, ...), more infos provided by status node.
-   September: Additional functionality: **Sonos Favorites**
-   October: joinGroup, leaveGroup   
-   November: general bug fixing, code optimization, error handling
-   Later: Additional functionality: Spotify, ...
