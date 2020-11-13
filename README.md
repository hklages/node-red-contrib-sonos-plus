## node-red-contrib-sonos-plus

[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/dt/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/v/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hklages/node-red-contrib-sonos-plus/master/LICENSE)
[![Donation](https://img.shields.io/badge/donation-cappuccino-orange)](https://www.buymeacoffee.com/hklages)

A set of [Node-RED](https://nodered.org/) nodes to control [SONOS](https://www.sonos.com/) player in your local network. Works well with [RedMatic](https://github.com/rdmtc/RedMatic/blob/master/README.en.md).

Add your playlist, album, station from Spotify, Napster, Amazon, ... to "My Sonos" using the original SONOS app. Play any of these items by using the "My Sonos" node (command mysonos.export.item) in combination with "Universal node" (command group.play.export). Music-Library and SONOS-Playlists are supported. Group players by using their SONOS-Playernames.

Read the Quickstart and explore the full scope in the [Wiki.](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

### ACTION REQUIRED TO MIGRATE TO VERSION 4

> See required action here: [issue 67](https://github.com/hklages/node-red-contrib-sonos-plus/issues/67)

### SUPPORT

Either open a github issue (preferred method) or send an email to nrcsplus@gmail.com

### NEWS

- !!! artUri now instead of AlbumArtUri, added serviceName to group.get.trackplus and some others.

- In Universal node: household.create.group - use a comma separated list with coordinator at first position to create a group

- In Universal node: new command group.get.members

- In Universal node: new command player.play.tv

### Installation

Install directly from your Node-RED's setting palette.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos) for the base API

[node-red-sonos team](https://github.com/shbert/node-red-contrib-sonos) shbert, jstrobel, Rolf-M: original package

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos) for adding IP address search function
