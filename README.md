# node-red-contrib-sonos-plus

Version 2019-08-18T2031

A set of NodeRed nodes to control SONOS player.  

This package uses code from **node-red-contrib-better-sonos**. I created a new package since the former package hasn't been maintained for more then a year.

## Installation

Install directly from your NodeRED's setting pallete.

## Special Functions

- Simple SONOS player selection in ConfigNode (recommendation: enter IP address)
- Comfortable selection of My SONOS radio stations (TuneIn, Amazon Prime)
- Supports TuneIn radio id to select radio stations
- Provides many kinds of current song information: artist, title but also radio station name
- Uses the newest node-sonos api (2019-08-18T0925)

## Restrictions

Currently the queue management does not support inserting complete playlists into the SONOS queue. Supported commands are: activate (=play), play next, play previous, flush, get queue, insert one song.

## Functions and Usage

The functions are grouped into 5 nodes.
- _Config_ node: Select SONOS player, stores serialnumber or IP address
- _Player control_ node: Execute basic SONOS player commands (e.g. play, stop, pause, ..)
- _Get player status_ node: Get information about current state of SONOS player (e. g. playing, volume, ..)
- _Manage queue_ node: Performs basic queue commands (e. g. activate queue, get queue information)
- _Manage radio_ node: Performs radio commands (e. g activate a TuneIn radio, Amazon Prime radio station)

> It is recommended to assign static IP addresses (best in your router) to each SONOS player and use these addresses in the configNode.  

## SONOS General Concepts

**SONOS Player** may either(!) play a **stream** from **radio stations** or **songs** (= tracks) from the **SONOS queue**.
- The radio station can be chosen from TuneIn or other services e. g. Amazon Prime. When choosen they start to play.
- Before activating the queue modus the SONOS queue must have been filled with songs. This can be done by chosing songs form different sources (Album, single song) or through playlists and inserting them into the SONOS queue.   

SONOS players may be **grouped** together (forming a **Zone**) to play the same song/stream in synch. In each group there is exactly one **leading player**. Several commands (play, stop, activate queue, radio, .. )  will impact all group members when having been send to the leading player. Other commands are only SONOS player specific e.g . mute, volume, ...

**My SONOS** contains shortcuts to different sources and is grouped into Radio stations, Playlists, Album, Songs and My Library. The radio stations are sorted alphabetically.

## Roadmap

- 2019-08: Update to newest version of dependencies (node-sonos) DONE
- 2019-08: Use My_SONOS to select radio stations DONE
- 2019-08: Use TuneIn Radio id to select radio stations DONE
- 2019-08: Improve debugging, logging capabilities
- 2019-08: Fix joinGroup, leaveGroup and
- 2019-09/10: Insert a playlist into SONOS queue  
- 2019/2020: Spotify, ...

## Credentials

[node-sonos api team](https://github.com/bencevans/node-sonos)

[node-red-better-sonos team](https://github.com/originallyus/node-red-contrib-better-sonos)

## Examples

![Examples](https://raw.github.com/hklages/node-red-contrib-sonos-plus/master/Examples.png "Examples")


## Flows

'''
[{"id":"175a72be.13c86d","type":"debug","z":"b7021e0a.656f8","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":512,"y":278,"wires":[]},{"id":"1c90ac1.a34a654","type":"sonos-manage-radio","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":344,"y":278,"wires":[["175a72be.13c86d"]]},{"id":"cdab07b6.a33df8","type":"inject","z":"b7021e0a.656f8","name":"play TuneIn s24896","topic":"s24896","payload":"play_TuneIn","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":130,"y":278,"wires":[["1c90ac1.a34a654"]]},{"id":"32fab9f.9852246","type":"comment","z":"b7021e0a.656f8","name":"Play a specific TuneIn radio station (s24896)","info":"","x":190,"y":226,"wires":[]},{"id":"befb10e1.40bc","type":"comment","z":"b7021e0a.656f8","name":"Get an array of all My Sonos radio stations (TuneIn, Amazon Prime)","info":"","x":260,"y":365,"wires":[]},{"id":"ab5f322d.6c4ff","type":"debug","z":"b7021e0a.656f8","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":479,"y":418,"wires":[]},{"id":"869bcf26.f9325","type":"sonos-manage-radio","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":304,"y":418,"wires":[["ab5f322d.6c4ff"]]},{"id":"6e659087.d491","type":"inject","z":"b7021e0a.656f8","name":"get My Sonos","topic":"","payload":"get_mysonos","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":110,"y":418,"wires":[["869bcf26.f9325"]]},{"id":"9a33f4e6.018a48","type":"inject","z":"b7021e0a.656f8","name":"play MySonos radion station  \"NDR\"","topic":"NDR","payload":"play_MySonos","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":180,"y":559,"wires":[["511b5f4b.4966e"]]},{"id":"511b5f4b.4966e","type":"sonos-manage-radio","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":444,"y":559,"wires":[["cefbb00b.d8009"]]},{"id":"cefbb00b.d8009","type":"debug","z":"b7021e0a.656f8","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":615,"y":559,"wires":[]},{"id":"f656b563.7f5848","type":"comment","z":"b7021e0a.656f8","name":"Play from My Sonos the radio station with title containig  \"NDR\"","info":"","x":240,"y":506,"wires":[]},{"id":"67353c6e.7f5874","type":"sonos-manage-queue","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","songuri":"","position":"","positioninqueue":"","name":"","x":808,"y":699,"wires":[[]]},{"id":"b3f5ba0d.fae688","type":"inject","z":"b7021e0a.656f8","name":"Get queue","topic":"","payload":"get_queue","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":100,"y":700,"wires":[["92aa39e6.fd5968"]]},{"id":"92aa39e6.fd5968","type":"sonos-manage-queue","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","songuri":"","position":"","positioninqueue":"","name":"","x":140,"y":740,"wires":[["6a4007fd.da0bc8"]]},{"id":"1ede71d3.9c3bee","type":"change","z":"b7021e0a.656f8","name":"activate queue, play first song","rules":[{"t":"set","p":"payload","pt":"msg","to":"activate_queue","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":557,"y":699,"wires":[["67353c6e.7f5874"]]},{"id":"6a4007fd.da0bc8","type":"switch","z":"b7021e0a.656f8","name":"","property":"queue_length","propertyType":"msg","rules":[{"t":"gt","v":"0","vt":"str"},{"t":"else"}],"checkall":"true","repair":false,"outputs":2,"x":318,"y":721,"wires":[["1ede71d3.9c3bee"],["950c79c0.7f7a28"]]},{"id":"950c79c0.7f7a28","type":"debug","z":"b7021e0a.656f8","name":"Queue is empty - havent activate queue","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":586,"y":753,"wires":[]},{"id":"7d48ce71.5f283","type":"comment","z":"b7021e0a.656f8","name":"Check whether queue is not empty and play first song","info":"","x":220,"y":646,"wires":[]},{"id":"f36a9784.4895d8","type":"inject","z":"b7021e0a.656f8","name":"play","topic":"","payload":"play","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":94,"wires":[["f936ab1b.cd7408"]]},{"id":"f936ab1b.cd7408","type":"sonos-control-player","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":260,"y":94,"wires":[]},{"id":"7653fdfa.d445d4","type":"comment","z":"b7021e0a.656f8","name":"Play, louder, leave group, ...","info":"","x":140,"y":43,"wires":[]},{"id":"8218d7c6.5f1568","type":"inject","z":"b7021e0a.656f8","name":"louder +5","topic":"","payload":"+5","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":480,"y":96,"wires":[["3921336c.83345c"]]},{"id":"3921336c.83345c","type":"sonos-control-player","z":"b7021e0a.656f8","confignode":"84e94467.f9dd28","name":"","x":657,"y":96,"wires":[]},{"id":"5f5d5f3f.89165","type":"inject","z":"b7021e0a.656f8","name":"leave group","topic":"","payload":"leave_group","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":110,"y":152,"wires":[["b731d0b9.64b3c"]]},{"id":"b731d0b9.64b3c","type":"sonos-control-player","z":"b7021e0a.656f8","confignode":"8afb119a.8c98a","name":"","x":320,"y":152,"wires":[]},{"id":"84e94467.f9dd28","type":"sonos-config","z":"","name":"sonos","serialnum":"5C-AA-FD-00-22-36:1","ipaddress":"192.168.178.41"},{"id":"8afb119a.8c98a","type":"sonos-config","z":"","name":"bad","serialnum":"00-0E-58-FE-3A-EA:5","ipaddress":"192.168.178.45"}]
'''
