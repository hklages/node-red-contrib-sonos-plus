# node-red-contrib-sonos-plus

[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/dt/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/v/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hklages/node-red-contrib-sonos-plus/master/LICENSE)

A set of [Node-RED](https://nodered.org/) nodes to control [SONOS](https://www.sonos.com/) player in your local network. Works well with [RedMatic](https://github.com/rdmtc/RedMatic/blob/master/README.en.md).

Add your playlist, album, station from Spotify, Napster, Amazon, ... to "My Sonos" using the original SONOS app. Play any of these items by using the "My Sonos" node (command mysonos.export.item) in combination with "Universal node" (command group.play.export).

See the full scope of commands [here.](https://github.com/hklages/node-red-contrib-sonos-plus/wiki/A.1-Universal-Node)

## C A U T I O N : MAJOR CHANGES !!!!

> **ACTION REQUIRED** - Modify all existing Universal / My Sonos nodes!<br><br>
> **Quick solution:** Open the node, tic the compatibility box and select "using msg" in the command selection box.<br><br>
> **Recommendat solution:** Change your flow and use msg.payload as "change" property (former msg.topic). Use the command selection box to choose the appropriate command.

## NEWS:  See all changes in change log

For the new nodes "Universal", "My Sonos" I now follow the Node-RED default: msg.payload holds the "change" (on/off, uri, new volume, ... ). msg.cmd holds the command.
msg.topic is "reserved" for future usage.

You can still use the old style with "compatiblity" tic box in combination with command "using msg".

- "Universal" node now supports selecting the command and includes all commands from "Control Player, "Get Status", "Manage Radio" , "Manage Queue".

- New "Universal" node allows usage of SONOS player names (room names) and makes group handling much easier.

- Usage of nodes "Control Player", "Get Status", "Manage Radio", "Manage Queue" is depreciated. Please use nodes "Universal", "My Sonos".

- Please use msg.payload for "changes" (on/off, uri, volume, ...) and node selection box (or msg.cmd) for commands and NOT msg.topic for "changes" and msg.payload for command.

## Installation

Install directly from your Node-RED's setting pallete.

## Major Functions

- SONOS Player: Simply select the SONOS player in ConfigNode by search button.
- Universal node: Use SONOS player names - commands act on whole group/room by default. Works with My Sonos via export.item, play.export.
- Queue playlists, albums, tracks from Spotify, Napster, Amazon, ... with My Sonos by using a title search string
- Stream stations from Amazon, Napster, TuneIn, Radioplayer, ... with My Sonos by using a title search string
- TuneIn radio ID: Select and play TuneIn stations by simply submitting the TuneIn radio id
- Basic functions: play, stop, pause, mute, group, activate line in, ...
- Playlists: Insert Music Library playlist or Sonos playlist - using search string in playlist name
- Notification: Interrupt current song and play a notification
- Special options: Set Loudness, Crossface, NightMode, SpeechEnhancement mode, ...
- Data: Provides many kinds of current song data: artist, title, media information and radio station name

## Restrictions

> When playing a radio station the commands next.track, previous.track may cause an error message as many stations do not support them.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Usage

For more information - also examples - see the [Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos) for the base API

[node-red-sonos team](https://github.com/shbert/node-red-contrib-sonos) shbert, jstrobel, Rolf-M: original package

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos) for adding IP address search function
