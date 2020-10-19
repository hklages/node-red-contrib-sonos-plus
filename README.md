## node-red-contrib-sonos-plus

[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/dt/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/v/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hklages/node-red-contrib-sonos-plus/master/LICENSE)

[![Donation](https://img.shields.io/badge/donation-cappuccino-orange)](https://www.buymeacoffee.com/hklages)

A set of [Node-RED](https://nodered.org/) nodes to control [SONOS](https://www.sonos.com/) player in your local network. Works well with [RedMatic](https://github.com/rdmtc/RedMatic/blob/master/README.en.md).

Add your playlist, album, station from Spotify, Napster, Amazon, ... to "My Sonos" using the original SONOS app. Play any of these items by using the "My Sonos" node (command mysonos.export.item) in combination with "Universal node" (command group.play.export).

See the full scope of commands in the [Wiki.](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

### ACTION REQUIRED VERSION 4

> See required action here: [issue 67](https://github.com/hklages/node-red-contrib-sonos-plus/issues/67)

### NEWS

- In "Universal", "My Sonos" node: According to Node-RED standards msg.payload is now being used for the "message/state" (such as on/off, new volume, uri, ...) and msg.topic for the command. There is a compatibility mode that lets you still use the old style (msg.payload holds the command and msg.topic the state). This mode has to be manually activated in each node (tic box compatibility) and can be used as a work around for some month.

- In "Universal", "My Sonos" node: You can now select the command and provide the state inside the node. Please use it! It works in default and in compatibility mode.

- In "Universal", "My Sonos" node: For all commands I removed the displayed text is now the command (I learned that the help text is only confusing)

- In Universal node: !!!! household.create.group - use a comma separated list with coordinator at first position to create a group

- In Universal node: new commands household.separate.group, player.become.standalone, coordinator.delegate

- In My Sonos node: new command library.export.album

- Node "Get Status", "Manage Radio", "Control player", "Manage Queue" removed - please use node "Universal" and "My Sonos"

### Installation

Install directly from your Node-RED's setting pallete.

### Major Functions

- SONOS Player: Simply select the SONOS player in ConfigNode by search button.
- Universal node: Use SONOS player names - commands act on whole group/room by default. Works with My Sonos via mysonos.export.item, group.play.export.
- Queue playlists, albums, tracks from Spotify, Napster, Amazon, ... with My Sonos by using a title search string
- Stream stations from Amazon, Napster, TuneIn, Radioplayer, ... with My Sonos by using a title search string
- TuneIn radio ID: Select and play TuneIn stations by simply submitting the TuneIn radio id
- Basic functions: play, stop, pause, mute, group, activate line in, ...
- Playlists: Insert Music Library playlist or Sonos playlist - using search string in playlist name
- Notification: Interrupt current song and play a notification
- Special options: Set Loudness, Crossface, NightMode, Dialog level (SpeechEnhancement) mode, bass, treble, ...
- Data: Provides many kinds of current song data: artist, title, media information and radio station name

### Restrictions

> When playing a radio station the commands next.track, previous.track may cause an error message as many stations do not support them.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Usage

For more information - also examples - see the [Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

### Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos) for the base API

[node-red-sonos team](https://github.com/shbert/node-red-contrib-sonos) shbert, jstrobel, Rolf-M: original package

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos) for adding IP address search function
