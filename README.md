# node-red-contrib-sonos-plus
[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/dt/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/v/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hklages/node-red-contrib-sonos-plus/master/LICENSE)

A set of [Node-RED](https://nodered.org/) nodes to control [SONOS](https://www.sonos.com/) player in your local network. Works well with [RedMatic](https://github.com/rdmtc/RedMatic/blob/master/README.en.md).

## NEWS
- Node Control Player: Added set_crossfademode (On/Off)
- Node Get Status: Added get_crossfademode (0: Off, 1: On)
- Node Get Status: Added get_eq to get information about NightMode, DialogLevel, GainSub, ...
- Node Get Status: Added command get_groups to provide information about groups, members in groups
- Node Get Status: Added msg.suppressWarnings for get_songmedia, get_songinfo to suppress warnings

## Installation

Install directly from your NodeRED's setting pallete.

## Major Functions

- SONOS Player: Simply select the SONOS player in ConfigNode by search button (recommendation: enter IP address, processing is faster)
- Basic functions: play, stop, pause, mute, group, activate line in, ...
- TuneIn radio ID: Select and play TuneIn stations by simply submitting the TuneIn radio id
- Stations: Convenient selection of "My Sonos" radio station from TuneIn and Amazon Prime by name (search string in station name).
- Spotify: Insert playlists, album, songs from My Sonos - using search string in playlist name - or direct with uri
- Playlists: Insert Amazon Prime playlist from My Sonos - using search string in playlist name
- Playlists: Insert Music Library playlist or Sonos playlist - using search string in playlist name
- Notification: Interrupt current song and play a notification
- Test: Test command to check whether SONOS player is reachable ( means on and really a SONOS player)
- Information: Provides many kinds of current song information: artist, title, media information and radio station name

## Restrictions

> When playing a radio station the commands next_song, previous_song may cause an error message as many stations do not support them.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Usage ...
For more information - also examples - see the [Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)


## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos)

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos)
