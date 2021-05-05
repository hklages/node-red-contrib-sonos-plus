## node-red-contrib-sonos-plus

[![Dependencies](https://david-dm.org/hklages/node-red-contrib-sonos-plus.svg)](https://david-dm.org/hklages/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/dt/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![npm](https://img.shields.io/npm/v/node-red-contrib-sonos-plus.svg)](https://www.npmjs.com/package/node-red-contrib-sonos-plus)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/Naereen/StrapDown.js/graphs/commit-activity)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/hklages/node-red-contrib-sonos-plus/master/LICENSE)
[![Donation](https://img.shields.io/badge/donation-cappuccino-orange)](https://www.buymeacoffee.com/hklages)

A set of [Node-RED](https://nodered.org/) nodes to control [SONOS](https://www.sonos.com/) player in your local network.

Works well with [Home Assistant](https://www.home-assistant.io/) and with the sister package [node-red-contrib-sonos-events](https://github.com/hklages/node-red-contrib-sonos-events), handling SONOS events.

This package is in no way connected to or supported by [Sonos Inc.](https://www.sonos.com/de-de/impressum)

### Highlights

- Play your track, album, playlist, station from Spotify, Napster, Amazon, Deezer and other music content provider.

- My Sonos, Music-Library (NAS shares), SONOS-Playlists and SONOS-Queue are supported.

- Control your player: play, stop, pause - modify the SONOS queue.

- Change player setting such as volume, mute state, loudness, treble, bass, the LED and more.

- Group players by using their SONOS-Playernames.

Explore the full scope in the [Wiki.](https://github.com/hklages/node-red-contrib-sonos-plus/wiki)

### QUICKSTART - DEGUG - SUPPORT

There is a Quickstart guide in the [Wiki](https://github.com/hklages/node-red-contrib-sonos-plus/wiki#quickstart) and example flows in Node-RED `Import - Examples`.

Set the ENV variable DEBUG for debugging (example `DEBUG=nrcsp:universal`). Usage is described [here](https://www.npmjs.com/package/debug). Prefix: `nrcsp:` and available keywords: `universal|mysonos|config|commands|extensions|helper|discovery|`.

Open a GitHub issue (preferred method) or send an email to nrcsplus@gmail.com (German/English).

### NEWS

You can not disable the SONOS-Player - availability - check at deployment time. That makes sense for those player being offline during deployment.

This package is now based on [svrooij node-sonos-ts](https://www.npmjs.com/package/@svrooij/sonos) and keeps the focus on SONOS commands.
The discovery of player and the node dialogs are improved. For details see the change log.

### Installation

Install directly from your Node-RED's setting palette.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Credentials

[svrooij node-sonos-ts](https://www.npmjs.com/package/@svrooij/sonos) for the excellent API.
