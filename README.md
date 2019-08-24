# node-red-contrib-sonos-plus

Version 2019-08-24T2155

A set of NodeRed nodes to control SONOS player in your local WLAN.

This package uses code from **node-red-contrib-better-sonos**. I created this new package since the former package hasn't been maintained for more then a year.

## Installation

Install directly from your NodeRED's setting pallete.

## Special Functions

- Simple SONOS player selection in ConfigNode (recommendation: enter IP address)
- Comfortable selection of My SONOS radio stations (TuneIn, Amazon Prime) by search string.
- Supports TuneIn radio id to select and play radio stations
- Provides many kinds of current song information: artist, title, media information and radio station name
- Uses the newest node-sonos api (2019-08-18T0925)

## Restrictions

Currently the manage queue node does not support inserting complete playlists into the SONOS queue. Supported commands are: activate (=play), play flush, get queue.

> When playing a radio station the commands next_song, previous_song may cause a warning as many stations do not support them.

## Functions and Usage

The functions are grouped into 5 nodes.
- _Config_ node: Select SONOS player, stores serialnumber or IP address
- _Control player_ node: Execute basic SONOS player commands (e.g. play, stop, pause, join/leave group ...)
- _Get status_ node: Get information about current state of SONOS player (e. g. playing, volume, groups, song info ...)
- _Manage queue_ node: Performs basic queue commands (e. g. activate queue and start playing, get queue information)
- _Manage radio_ node: Performs radio commands (e. g activate a TuneIn radio, Amazon Prime radio station)

Examples are attached at the end of this readme.

## RECOMMENDATIONS, HOWTO, SONOS GENERAL Concept
see the wiki.

## Roadmap

- 2019-08: Update to newest version of dependencies (node-sonos) DONE
- 2019-08: Use My_SONOS to select radio stations DONE
- 2019-08: Use TuneIn Radio id to select radio stations DONE
- 2019-08: Improve debugging, logging capabilities IN WORK
- 2019-08: Fix join_group, leave_group and get group information DONE
- 2019-09/10: Insert a playlist into SONOS queue  IN WORK
- 2019/2020: Spotify, ...

## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos)

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos)

## Examples

![Examples](https://raw.github.com/hklages/node-red-contrib-sonos-plus/master/Examples.png "Examples")

## Flows

'''
[{"id":"175a72be.13c86d","type":"debug","z":"b7021e0a.656f8","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":512,"y":259,"wires":[]},{"id":"1c90ac1.a34a654","type":"sonos-manage-radio","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":344,"y":259,"wires":[["175a72be.13c86d"]]},{"id":"cdab07b6.a33df8","type":"inject","z":"b7021e0a.656f8","name":"play TuneIn s24896","topic":"s24896","payload":"play_TuneIn","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":130,"y":259,"wires":[["1c90ac1.a34a654"]]},{"id":"32fab9f.9852246","type":"comment","z":"b7021e0a.656f8","name":"Play a specific TuneIn radio station (s24896)","info":"","x":190,"y":207,"wires":[]},{"id":"befb10e1.40bc","type":"comment","z":"b7021e0a.656f8","name":"Get an array of all My Sonos radio stations (TuneIn, Amazon Prime)","info":"","x":260,"y":346,"wires":[]},{"id":"ab5f322d.6c4ff","type":"debug","z":"b7021e0a.656f8","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":479,"y":399,"wires":[]},{"id":"869bcf26.f9325","type":"sonos-manage-radio","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":304,"y":399,"wires":[["ab5f322d.6c4ff"]]},{"id":"6e659087.d491","type":"inject","z":"b7021e0a.656f8","name":"get My Sonos","topic":"","payload":"get_mysonos","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":110,"y":399,"wires":[["869bcf26.f9325"]]},{"id":"9a33f4e6.018a48","type":"inject","z":"b7021e0a.656f8","name":"play MySonos radion station  \"NDR\"","topic":"NDR","payload":"play_MySonos","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":180,"y":537,"wires":[["511b5f4b.4966e"]]},{"id":"511b5f4b.4966e","type":"sonos-manage-radio","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":444,"y":537,"wires":[["cefbb00b.d8009"]]},{"id":"cefbb00b.d8009","type":"debug","z":"b7021e0a.656f8","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":615,"y":537,"wires":[]},{"id":"f656b563.7f5848","type":"comment","z":"b7021e0a.656f8","name":"Play from My Sonos the radio station with title containig  \"NDR\"","info":"","x":240,"y":484,"wires":[]},{"id":"67353c6e.7f5874","type":"sonos-manage-queue","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","songuri":"","position":"","positioninqueue":"","name":"","x":860,"y":700,"wires":[[]]},{"id":"b3f5ba0d.fae688","type":"inject","z":"b7021e0a.656f8","name":"Get queue","topic":"","payload":"get_queue","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":100,"y":678,"wires":[["92aa39e6.fd5968"]]},{"id":"92aa39e6.fd5968","type":"sonos-manage-queue","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","songuri":"","position":"","positioninqueue":"","name":"","x":140,"y":718,"wires":[["6a4007fd.da0bc8"]]},{"id":"1ede71d3.9c3bee","type":"change","z":"b7021e0a.656f8","name":"activate queue, play first song","rules":[{"t":"set","p":"payload","pt":"msg","to":"activate_queue","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":577,"y":700,"wires":[["67353c6e.7f5874"]]},{"id":"6a4007fd.da0bc8","type":"switch","z":"b7021e0a.656f8","name":"","property":"queue_length","propertyType":"msg","rules":[{"t":"gt","v":"0","vt":"num"},{"t":"else"}],"checkall":"true","repair":false,"outputs":2,"x":318,"y":718,"wires":[["1ede71d3.9c3bee"],["950c79c0.7f7a28"]]},{"id":"950c79c0.7f7a28","type":"debug","z":"b7021e0a.656f8","name":"Queue is empty - havent activated queue","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":606,"y":740,"wires":[]},{"id":"7d48ce71.5f283","type":"comment","z":"b7021e0a.656f8","name":"Check whether queue is not empty and play first song","info":"","x":220,"y":624,"wires":[]},{"id":"f36a9784.4895d8","type":"inject","z":"b7021e0a.656f8","name":"play","topic":"","payload":"play","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":75,"wires":[["3921336c.83345c"]]},{"id":"7653fdfa.d445d4","type":"comment","z":"b7021e0a.656f8","name":"Play, louder, leave group, ...","info":"","x":140,"y":24,"wires":[]},{"id":"8218d7c6.5f1568","type":"inject","z":"b7021e0a.656f8","name":"louder +5","topic":"","payload":"+5","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":100,"y":121,"wires":[["3921336c.83345c"]]},{"id":"3921336c.83345c","type":"sonos-control-player","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":500,"y":72,"wires":[]},{"id":"5f5d5f3f.89165","type":"inject","z":"b7021e0a.656f8","name":"leave group","topic":"","payload":"leave_group","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":330,"y":121,"wires":[["3921336c.83345c"]]},{"id":"90cfc520.5219e8","type":"inject","z":"b7021e0a.656f8","name":"insert song to queue","topic":"x-sonosapi-hls-static:catalog%2ftracks%2fB07Q5JHQ7P%2f?sid=201&flags=0&sn=14\"","payload":"insert_uri","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":130,"y":798,"wires":[["ed3f8e27.ccdf2"]]},{"id":"ed3f8e27.ccdf2","type":"sonos-manage-queue","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","songuri":"","position":"","positioninqueue":"","name":"","x":480,"y":798,"wires":[[]]},{"id":"84e94467.f9dd28","type":"sonos-config","z":"","name":"sonos","serialnum":"5C-AA-FD-00-22-36:1","ipaddress":"192.168.178.41"}]
'''
