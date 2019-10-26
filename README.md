# node-red-contrib-sonos-plus
[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/dt/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/v/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hklages/node-red-contrib-sonos-plus/master/LICENSE)

A set of NodeRED nodes to control SONOS player in your local network. Works well with [RedMatic](https://github.com/rdmtc/RedMatic/blob/master/README.en.md)

## NEWS
Added msg.size to specify the size of Music Library playlist list.

Added msg.volume to set volume for commands: play, activate_avtransport, activate_queue, play_mysonos, play_tunein.

You can now use "catch" node to handle errors.

## Installation

Install directly from your NodeRED's setting pallete.

## Special Functions

- Sonos Player: Simply select SONOS player in ConfigNode by search button (recommendation: enter IP address)
- Stations: Convenient selection of "My Sonos" radio stations from TuneIn, Amazon Prime by name (search string).
- TuneIn radio ID: Select and play TuneIn stations by simply submitting the TuneIn radio id
- Playlists: Convenient selection (and insertion) of My Sonos Music Library  and Sonos playlists by name (search string).
- Playlists: Insert Amazon Prime standard playlists by URI
- Notification: Interrupt current song and play an notification
- Information: Provides many kinds of current song information: artist, title, media information and radio station name

## Restrictions

> When playing a radio station the commands next_song, previous_song may cause an error message as many stations do not support them.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Usage ...
For more information - also examples - see the [Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)



## Credentials

This package uses code from **node-red-contrib-better-sonos**. I created this new package since the former package hasn't been maintained for more then a year.

[node-sonos api team](https://github.com/bencevans/node-sonos)

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos)
