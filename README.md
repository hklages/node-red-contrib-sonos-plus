# node-red-contrib-sonos-plus

[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/dt/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/v/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hklages/node-red-contrib-sonos-plus/master/LICENSE)

A set of [Node-RED](https://nodered.org/) nodes to control [SONOS](https://www.sonos.com/) player in your local network. Works well with [RedMatic](https://github.com/rdmtc/RedMatic/blob/master/README.en.md).

## NEWS

- CAUTION: In node "Control Player" msg.payload is not anymore set to "true". msg is unmodified as everywhere else.

- CAUTION: In node "Control Player" play, stop, pause, toggleplayback, next_song, previous_song will now throw error message when send to "client" in a group.

- Added in Control Player node: create_stereopair, separate_stereopair (needs a special flow to extract uiid)

- CAUTION: In node "Get Status" msg.role is now "Coordinator" in stead of "master

- New "My Sonos" node supporting Spotify, Napster, Amazon, TuneIn, ... : Queue playlists, albums, tracks and stream radio stations. Select with title search string.


## Installation

Install directly from your NodeRED's setting pallete.

## Major Functions

- SONOS Player: Simply select the SONOS player in ConfigNode by search button (recommendation: enter IP address, processing is faster)
- Queue playlists, albums, tracks from Spotify, Napster, Amazon, ... with My Sonos by using a title search string
- Stream stations from Amazon, Napster, TuneIn, Radioplayer, ... with My Sonos by using a title search string
- TuneIn radio ID: Select and play TuneIn stations by simply submitting the TuneIn radio id
- Basic functions: play, stop, pause, mute, group, activate line in, ...
- Spotify: Insert playlists, album, songs with uri
- Playlists: Insert Music Library playlist or Sonos playlist - using search string in playlist name
- Notification: Interrupt current song and play a notification
- Special options: Set Loudness, Crossface, NightMode, SpeechEnhancement mode, ...
- Test: Test command to check whether SONOS player is reachable ( means on and really a SONOS player)
- Information: Provides many kinds of current song information: artist, title, media information and radio station name

## Restrictions

> When playing a radio station the commands next_song, previous_song may cause an error message as many stations do not support them.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Usage

For more information - also examples - see the [Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos) for the base API

[node-red-sonos team](https://github.com/shbert/node-red-contrib-sonos) shbert, jstrobel, Rolf-M: original package

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos) for adding IP address search function
