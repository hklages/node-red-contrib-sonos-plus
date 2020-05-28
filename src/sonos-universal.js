const {
  REGEX_SERIAL, REGEX_IP, REGEX_TIME, REGEX_RADIO_ID,
  NRCSP_ERRORPREFIX, PLAYER_WITH_TV, REGEX_ANYCHAR, REGEX_QUEUEMODES,
  discoverSonosPlayerBySerial,
  isValidProperty, isValidPropertyNotEmptyString, isTruthyAndNotEmptyString, isTruthy,
  onOff2boolean, string2ValidInteger, stringValidRegex,
  failure, success
} = require('./Helper.js')

const {
  getGroupMemberDataV2, playGroupNotification, playJoinerNotification,
  createGroupSnapshot, restoreGroupSnapshot, saveQueue, getAllSonosPlaylists, sortedGroupArray,
  getGroupVolume, getGroupMute, getPlayerQueue, setGroupVolumeRelative, setGroupMute, getCmd, setCmd
} = require('./Sonos-Commands.js')

const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  const COMMAND_TABLE_UNIVERSAL = {
    'group.adjust.volume': groupAdjustVolume,
    'group.clear.queue': groupClearQueue,
    'group.create.snap': groupCreateSnapshot,
    'group.get.crossfade': groupGetCrossfadeMode,
    'group.get.mutestate': groupGetMute,
    'group.get.playbackstate': groupGetPlaybackstate,
    'group.get.queue': groupGetQueue,
    'group.get.sleeptimer': groupGetSleeptimer,
    'group.get.state': groupGetState,
    'group.get.trackplus': groupGetTrackPlus,
    'group.get.volume': groupGetVolume,
    'group.next.track': groupNextTrack,
    'group.pause': groupPause,
    'group.play': groupPlay,
    'group.play.export': groupPlayExport,
    'group.play.notification': groupPlayNotification,
    'group.play.queue': groupPlayQueue,
    'group.play.snap': groupPlaySnapshot,
    'group.play.streamhttp': groupPlayStreamHttp,
    'group.play.track': groupPlayTrack,
    'group.play.tunein': groupPlayTuneIn,
    'group.previous.track': groupPreviousTrack,
    'group.remove.tracks': groupRemoveTracks,
    'group.save.queue': groupSaveQueueToSonosPlaylist,
    'group.seek': groupSeek,
    'group.set.crossfade': groupSetCrossfade,
    'group.set.mutestate': groupSetMute,
    'group.set.queuemode': groupSetQueuemode,
    'group.set.sleeptimer': groupSetSleeptimer,
    'group.stop': groupStop,
    'group.toggle.playback': groupTogglePlayback,
    'household.create.stereopair': householdCreateStereoPair,
    'household.get.groups': householdGetGroups,
    'household.remove.sonosplaylist': householdRemoveSonosPlaylist,
    'household.separate.stereopair': householdSeparateStereoPair,
    'household.test.player': householdTestPlayerOnline,
    'joiner.play.notification': joinerPlayNotification,
    'player.adjust.volume': playerAdjustVolume,
    'player.get.dialoglevel': playerGetEq,
    'player.get.led': playerGetLed,
    'player.get.loudness': playerGetLoudness,
    'player.get.mutestate': playerGetMute,
    'player.get.nightmode': playerGetEq,
    'player.get.properties': playerGetProperties,
    'player.get.queue': playerGetQueue,
    'player.get.role': playerGetRole,
    'player.get.subgain': playerGetEq,
    'player.get.volume': playerGetVolume,
    'player.join.group': playerJoinGroup,
    'player.leave.group': playerLeaveGroup,
    'player.play.avtransport': playerPlayAvtransport,
    'player.set.dialoglevel': playerSetEQ,
    'player.set.led': playerSetLed,
    'player.set.loudness': playerSetLoudness,
    'player.set.mutestate': playerSetMute,
    'player.set.nightmode': playerSetEQ,
    'player.set.subgain': playerSetEQ,
    'player.set.volume': playerSetVolume
  }

  /** Create Universal node, get valid ipaddress, store nodeDialog and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosUniversalNode (config) {
    RED.nodes.createNode(this, config)
    const nrcspFunction = 'create and subscribe'

    const node = this
    // this is only used in processInputMessage.
    node.nrcspCompatibilty = config.compatibilityMode // defines what propoerty holds command, additional data
    node.nrcspCommand = config.command // holds the dialog command if selected

    // ipaddress overriding serialnum - at least one must be valid
    const configNode = RED.nodes.getNode(config.confignode)
    if (isValidProperty(configNode, ['ipaddress']) && typeof configNode.ipaddress === 'string' && REGEX_IP.test(configNode.ipaddress)) {
      node.debug(`OK config node IP address ${configNode.ipaddres} is being used`)
    } else {
      if (isValidProperty(configNode, ['serialnum']) && typeof configNode.serialnum === 'string' && REGEX_SERIAL.test(configNode.serialnum)) {
        discoverSonosPlayerBySerial(node, configNode.serialnum, (err, newIpaddress) => {
          if (err) {
            failure(node, null, new Error(`${NRCSP_ERRORPREFIX} could not figure out ip address (discovery)`), nrcspFunction)
            return
          }
          if (newIpaddress === null) {
            failure(node, null, new Error(`${NRCSP_ERRORPREFIX} could not find any player by serial`), nrcspFunction)
          } else {
            // setting of nodestatus is done in following call handelIpuntMessage
            node.debug(`OK sonos player ${newIpaddress} was found`)
            configNode.ipaddress = newIpaddress
          }
        })
      } else {
        failure(node, null, new Error(`${NRCSP_ERRORPREFIX} both ipaddress and serial number are invalid/missing`), nrcspFunction)
        return
      }
    }

    // clear node status
    node.status({})

    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received')
      processInputMsg(node, msg, configNode.ipaddress)
        .then((msgUpdate) => {
          Object.assign(msg, msgUpdate) // defines the ouput message
          success(node, msg, msg.backupCmd)
        })
        .catch((error) => failure(node, msg, error, 'processing input msg'))
    })
  }

  /** Validate sonos player object, command and dispatch further.
   * @param  {object}  node current node
   * @param  {string}  node.nrcspCommand the command from node dialog
   * @param  {boolean} node.nrcspCompatibilty tic from node dialog
   * @param  {object}  msg incoming message
   * @param  {string}  ipaddress IP address of sonos player
   *
   * @return {promise} All commands have to return a promise - object
   * example: returning {} means message is not modified
   * example: returning { payload: true} means the orignal msg.payload will be modified and set to true
   * [{"id":"d3c4b5a7.528288","type":"inject","z":"4318847d.0693cc","name":"","topic":"","payload":"clear.queue","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":110,"y":329,"wires":[["fc8ec1ee.dada8"]]},{"id":"6280f87a.0562c8","type":"change","z":"4318847d.0693cc","name":"queue","rules":[{"t":"set","p":"payload","pt":"msg","to":"queue","tot":"str"},{"t":"set","p":"topic","pt":"msg","to":"Best of Prime","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":301,"y":331,"wires":[["5fe3a2ed.eb907c"]]},{"id":"744d729c.ee78dc","type":"debug","z":"4318847d.0693cc","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":552,"y":371,"wires":[]},{"id":"8dd4792.76eb088","type":"comment","z":"4318847d.0693cc","name":"Example 3: Replace SONOS queue without playing","info":"","x":195,"y":296,"wires":[]},{"id":"e2d2580b.4557e8","type":"inject","z":"4318847d.0693cc","name":"","topic":"Arabella","payload":"stream","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":120,"y":56,"wires":[["aa2e6460.b540a8"]]},{"id":"5d8ef2c9.43ff1c","type":"change","z":"4318847d.0693cc","name":"get.trackplus","rules":[{"t":"set","p":"payload","pt":"msg","to":"get.trackplus","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":718,"y":71,"wires":[["fa5800f0.d6f4c"]]},{"id":"6bbf67aa.5b6638","type":"debug","z":"4318847d.0693cc","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":1023,"y":71,"wires":[]},{"id":"faf9af99.954a4","type":"inject","z":"4318847d.0693cc","name":"","topic":"Best Of Lovesongs","payload":"stream","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":150,"y":95,"wires":[["aa2e6460.b540a8"]]},{"id":"e4646c63.7ee1f","type":"delay","z":"4318847d.0693cc","name":"","pauseType":"delay","timeout":"2","timeoutUnits":"seconds","rate":"1","nbRateUnits":"1","rateUnits":"second","randomFirst":"1","randomLast":"5","randomUnits":"seconds","drop":false,"x":567,"y":71,"wires":[["5d8ef2c9.43ff1c"]]},{"id":"f7c7fcf2.8c6ed","type":"comment","z":"4318847d.0693cc","name":"Example 1:  Play (TuneIn, Amazon) radio station using My Sonos and retrieve title, ...","info":"","x":295,"y":20,"wires":[]},{"id":"1fc5c102.abee9f","type":"comment","z":"4318847d.0693cc","name":"Example 4: Line in Play:5 / TV Beam or Playbar","info":"","x":185,"y":437,"wires":[]},{"id":"8978d019.4e76e","type":"switch","z":"4318847d.0693cc","name":"","property":"payload.modelName","propertyType":"msg","rules":[{"t":"eq","v":"Sonos Play:5","vt":"str"},{"t":"eq","v":"Sonos Beam","vt":"str"},{"t":"eq","v":"Sonos Playbar","vt":"str"}],"checkall":"true","repair":false,"outputs":3,"x":455,"y":471,"wires":[["de574d05.b6a53"],["e7542013.832ae"],["e7542013.832ae"]]},{"id":"de574d05.b6a53","type":"change","z":"4318847d.0693cc","name":"line in","rules":[{"t":"set","p":"topic","pt":"msg","to":"'x-rincon-stream:RINCON_' & \t$replace(msg.payload.MACAddress, ':', '') & \t'01400'\t","tot":"jsonata"}],"action":"","property":"","from":"","to":"","reg":false,"x":589,"y":442,"wires":[["41f8648f.bd838c"]]},{"id":"77db7f57.751e9","type":"comment","z":"4318847d.0693cc","name":"Example 5: Play Playlist from Music Library","info":"","x":165,"y":556,"wires":[]},{"id":"2172120a.6207ae","type":"inject","z":"4318847d.0693cc","name":"","topic":"","payload":"clear.queue","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":110,"y":590,"wires":[["fad22422.5dcc88"]]},{"id":"b1f4e729.e2d8f8","type":"change","z":"4318847d.0693cc","name":"activate queue","rules":[{"t":"set","p":"payload","pt":"msg","to":"play.queue","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":792,"y":590,"wires":[["ab1e13ab.c7d74"]]},{"id":"ff1ec5fc.0cff68","type":"inject","z":"4318847d.0693cc","name":"","topic":"x-file-cifs://nas2019/Multimedia/Music/MyMusic/Playlists/MLAdele.wpl","payload":"insert_uri","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":477,"y":666,"wires":[["9e0d7aee.907268"]]},{"id":"225eea23.4db686","type":"comment","z":"4318847d.0693cc","name":"or direct","info":"","x":477,"y":634,"wires":[]},{"id":"d890d3f3.68cd6","type":"inject","z":"4318847d.0693cc","name":"mute","topic":"On","payload":"set.mutestate","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":771,"wires":[["f9e99c11.a8edc","24a0a7e6.ae3b08"]]},{"id":"f9e99c11.a8edc","type":"delay","z":"4318847d.0693cc","name":"","pauseType":"delay","timeout":"1","timeoutUnits":"seconds","rate":"1","nbRateUnits":"1","rateUnits":"second","randomFirst":"1","randomLast":"5","randomUnits":"seconds","drop":false,"x":223,"y":793,"wires":[["a65048e1.879f98"]]},{"id":"98119167.abb2e","type":"change","z":"4318847d.0693cc","name":"stop","rules":[{"t":"set","p":"payload","pt":"msg","to":"stop","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":733,"y":793,"wires":[["24a0a7e6.ae3b08"]]},{"id":"418f0e18.4cf29","type":"delay","z":"4318847d.0693cc","name":"","pauseType":"delay","timeout":"1","timeoutUnits":"seconds","rate":"1","nbRateUnits":"1","rateUnits":"second","randomFirst":"1","randomLast":"5","randomUnits":"seconds","drop":false,"x":569,"y":843,"wires":[["61b7db70.f099d4"]]},{"id":"61b7db70.f099d4","type":"change","z":"4318847d.0693cc","name":"unmute","rules":[{"t":"set","p":"payload","pt":"msg","to":"set.mutestate","tot":"str"},{"t":"set","p":"topic","pt":"msg","to":"Off","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":743,"y":843,"wires":[["24a0a7e6.ae3b08"]]},{"id":"a65048e1.879f98","type":"change","z":"4318847d.0693cc","name":"play tuneIn station","rules":[{"t":"set","p":"payload","pt":"msg","to":"play.tunein","tot":"str"},{"t":"set","p":"topic","pt":"msg","to":"s24896","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":392,"y":793,"wires":[["418f0e18.4cf29","9cfa79ba.d93968"]]},{"id":"e7542013.832ae","type":"change","z":"4318847d.0693cc","name":"tv (line in)","rules":[{"t":"set","p":"topic","pt":"msg","to":"'x-sonos-htastream:RINCON_' & \t$replace(msg.payload.MACAddress, ':', '') & \t'01400:spdif'\t","tot":"jsonata"}],"action":"","property":"","from":"","to":"","reg":false,"x":599,"y":502,"wires":[["41f8648f.bd838c","243370d4.f112d"]]},{"id":"41f8648f.bd838c","type":"change","z":"4318847d.0693cc","name":"activate line","rules":[{"t":"set","p":"payload","pt":"msg","to":"player.play.avtransport","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":751,"y":471,"wires":[["a6111a85.251f68"]]},{"id":"625148f2.018378","type":"change","z":"4318847d.0693cc","name":"insert playlist","rules":[{"t":"set","p":"payload","pt":"msg","to":"insert_musiclibrary_playlist","tot":"str"},{"t":"set","p":"topic","pt":"msg","to":"MLAdele","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":434,"y":590,"wires":[["9e0d7aee.907268"]]},{"id":"e5c4eab4.b04df8","type":"comment","z":"4318847d.0693cc","name":"Example 7: Group players","info":"","x":115,"y":915,"wires":[]},{"id":"62a1b89.7509d48","type":"change","z":"4318847d.0693cc","name":"play swr3 on coordinator","rules":[{"t":"set","p":"payload","pt":"msg","to":"stream","tot":"str"},{"t":"set","p":"topic","pt":"msg","to":"SWR3","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":271,"y":949,"wires":[["435d406c.05c4e"]]},{"id":"ad8671c9.08f85","type":"inject","z":"4318847d.0693cc","name":"trigger","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":949,"wires":[["62a1b89.7509d48"]]},{"id":"8af22d58.53aff","type":"change","z":"4318847d.0693cc","name":"join group","rules":[{"t":"set","p":"topic","pt":"msg","to":"Küche","tot":"str"},{"t":"set","p":"payload","pt":"msg","to":"player.join.group","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":500,"y":951,"wires":[["d36c728b.5c65a"]]},{"id":"35be5578.80893a","type":"comment","z":"4318847d.0693cc","name":"Example 6: Set a morning station but dont play right now","info":"","x":215,"y":736,"wires":[]},{"id":"9e0d7aee.907268","type":"sonos-manage-queue","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","name":"","x":609,"y":590,"wires":[["b1f4e729.e2d8f8"]]},{"id":"aa2e6460.b540a8","type":"sonos-manage-mysonos","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","name":"","x":398,"y":71,"wires":[["e4646c63.7ee1f"]]},{"id":"2a470d1d.b5bc02","type":"comment","z":"4318847d.0693cc","name":"Example 2: Play a (MusicLibrary, Amazon) playlist using My Sonos ","info":"","x":245,"y":160,"wires":[]},{"id":"6bda4392.15afbc","type":"inject","z":"4318847d.0693cc","name":"","topic":"ML10CC","payload":"export.item","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":130,"y":200,"wires":[["a12c4300.4a2fa"]]},{"id":"a12c4300.4a2fa","type":"sonos-manage-mysonos","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","name":"","x":371,"y":214,"wires":[["cc0d78f0.3cebb8"]]},{"id":"20f34bd4.e96c84","type":"inject","z":"4318847d.0693cc","name":"","topic":"Best of Prime","payload":"export.item","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":150,"y":235,"wires":[["a12c4300.4a2fa"]]},{"id":"17d0af16.8a31a1","type":"debug","z":"4318847d.0693cc","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":700,"y":214,"wires":[]},{"id":"cc0d78f0.3cebb8","type":"sonos-universal","z":"4318847d.0693cc","confignode":"32a98882.56e1c8","command":"message","compatibilityMode":true,"name":"","x":562,"y":214,"wires":[["17d0af16.8a31a1"]]},{"id":"5fe3a2ed.eb907c","type":"sonos-manage-mysonos","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","name":"","x":390,"y":371,"wires":[["744d729c.ee78dc"]]},{"id":"435d406c.05c4e","type":"sonos-manage-mysonos","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","name":"","x":290,"y":988,"wires":[["8af22d58.53aff"]]},{"id":"48bb69e.93b5998","type":"polly","z":"4318847d.0693cc","name":"","voice":"0","ssml":false,"dir":"overwritten","config":"8945d5a5.31aef8","x":352,"y":1595,"wires":[["751fc24c.5f892c"],[]]},{"id":"47273022.7b687","type":"inject","z":"4318847d.0693cc","name":"weather","topic":"notification_weather.mp3","payload":"We expect nice weather without any rain. Enjoy the day.","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":1550,"wires":[["60d50c04.dc4f34"]]},{"id":"384278f8.a57c98","type":"change","z":"4318847d.0693cc","name":"prepare play notification","rules":[{"t":"set","p":"payload","pt":"msg","to":"play.notification","tot":"str"},{"t":"set","p":"volume","pt":"msg","to":"70","tot":"num"},{"t":"set","p":"topic","pt":"msg","to":"$globalContext('system_baseUrl') & '/notifications/' & topic","tot":"jsonata"},{"t":"set","p":"sameVolume","pt":"msg","to":"true","tot":"bool"}],"action":"","property":"","from":"","to":"","reg":false,"x":652,"y":1633,"wires":[["a94b74c4.c18738"]]},{"id":"6dc684d2.01c19c","type":"fs-ops-copy","z":"4318847d.0693cc","name":"","sourcePath":"","sourcePathType":"str","sourceFilename":"file","sourceFilenameType":"msg","destPath":"notification_cache","destPathType":"global","destFilename":"topic","destFilenameType":"msg","link":false,"overwrite":true,"x":596,"y":1591,"wires":[["384278f8.a57c98"]]},{"id":"751fc24c.5f892c","type":"switch","z":"4318847d.0693cc","name":"","property":"_polly.cached","propertyType":"msg","rules":[{"t":"false"},{"t":"else"}],"checkall":"false","repair":false,"outputs":2,"x":468,"y":1597,"wires":[["6dc684d2.01c19c"],["384278f8.a57c98"]]},{"id":"17d3d81e.fd5208","type":"inject","z":"4318847d.0693cc","name":"Caution","topic":"notification_caution.mp3","payload":"Caution Caution Caution","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":1582,"wires":[["60d50c04.dc4f34"]]},{"id":"f951db37.428e28","type":"inject","z":"4318847d.0693cc","name":"inform","topic":"notification_inform.mp3","payload":"Please mind your steps","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":1615,"wires":[["60d50c04.dc4f34"]]},{"id":"c4e97855.112e88","type":"comment","z":"4318847d.0693cc","name":"Trigger Examples","info":"","x":119,"y":1511,"wires":[]},{"id":"af5b8d26.1705c","type":"comment","z":"4318847d.0693cc","name":"Create/Update mp3 file, create uri and parameter","info":"","x":481,"y":1511,"wires":[]},{"id":"d80a6d67.99515","type":"comment","z":"4318847d.0693cc","name":"Serialize msgs and play notification","info":"","x":1030,"y":1510,"wires":[]},{"id":"63cf7c29.d98064","type":"inject","z":"4318847d.0693cc","name":"Clear storage / cache","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":747,"y":1366,"wires":[["c4a71b8c.25a638","15147b67.cd39d5"]]},{"id":"a8b10427.3fe018","type":"link in","z":"4318847d.0693cc","name":"execute play_notification","links":["a94b74c4.c18738"],"x":904,"y":1550,"wires":[["c6772716.60af68"]]},{"id":"a94b74c4.c18738","type":"link out","z":"4318847d.0693cc","name":"Trigger play_notification","links":["a8b10427.3fe018"],"x":752,"y":1550,"wires":[]},{"id":"c6e721c.1b95de","type":"inject","z":"4318847d.0693cc","name":"set","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":1400,"wires":[["6f073a90.08bd84","1e24ff39.4630d1","78ebe214.17527c"]]},{"id":"c5ad62c1.4abfb","type":"comment","z":"4318847d.0693cc","name":"TTS, notification","info":"","x":85,"y":1331,"wires":[]},{"id":"ed11ae49.b8a2d","type":"comment","z":"4318847d.0693cc","name":"Set Up","info":"","x":91,"y":1366,"wires":[]},{"id":"6f073a90.08bd84","type":"change","z":"4318847d.0693cc","name":"","rules":[{"t":"set","p":"system_baseUrl","pt":"global","to":"http://192.168.178.49:1880","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":296,"y":1367,"wires":[[]]},{"id":"1e24ff39.4630d1","type":"change","z":"4318847d.0693cc","name":"","rules":[{"t":"set","p":"notification_directory","pt":"global","to":"\\Users\\hekla\\AppData\\Local\\Temp","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":306,"y":1399,"wires":[[]]},{"id":"78ebe214.17527c","type":"change","z":"4318847d.0693cc","name":"","rules":[{"t":"set","p":"notification_cache","pt":"global","to":"\\Users\\hekla\\AppData\\Local\\Temp","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":296,"y":1431,"wires":[[]]},{"id":"cb99335a.e0a0e","type":"change","z":"4318847d.0693cc","name":"add cache","rules":[{"t":"set","p":"options.dir","pt":"msg","to":"notification_cache","tot":"global"}],"action":"","property":"","from":"","to":"","reg":false,"x":605,"y":1549,"wires":[["48bb69e.93b5998"]]},{"id":"a9529c34.96d74","type":"link in","z":"4318847d.0693cc","name":"TTS Execute","links":["18152db0.dc8512","60d50c04.dc4f34","26ac2b2.49d16d4"],"x":315,"y":1549,"wires":[["e9d1d7a9.402848"]]},{"id":"60d50c04.dc4f34","type":"link out","z":"4318847d.0693cc","name":"TTS Trigger","links":["a9529c34.96d74"],"x":207,"y":1549,"wires":[]},{"id":"63902954.cc2b48","type":"comment","z":"4318847d.0693cc","name":"Maintain","info":"","x":554,"y":1367,"wires":[]},{"id":"62c214c3.ab9e3c","type":"fs-ops-delete","z":"4318847d.0693cc","name":"","path":"notification_directory","pathType":"global","filename":"files","filenameType":"msg","x":867,"y":1405,"wires":[[]]},{"id":"c4a71b8c.25a638","type":"fs-ops-dir","z":"4318847d.0693cc","name":"","path":"notification_directory","pathType":"global","filter":"notification_*.*","filterType":"str","dir":"files","dirType":"msg","x":717,"y":1405,"wires":[["62c214c3.ab9e3c"]]},{"id":"15147b67.cd39d5","type":"fs-ops-dir","z":"4318847d.0693cc","name":"","path":"notification_cache","pathType":"global","filter":"*_*.mp3","filterType":"str","dir":"files","dirType":"msg","x":717,"y":1438,"wires":[["866b0ab0.299a28"]]},{"id":"866b0ab0.299a28","type":"fs-ops-delete","z":"4318847d.0693cc","name":"","path":"notification_directory","pathType":"global","filename":"files","filenameType":"msg","x":867,"y":1438,"wires":[[]]},{"id":"21466965.515bf6","type":"status","z":"4318847d.0693cc","name":"","scope":["7435b64e.0a2fb8"],"x":949,"y":1599,"wires":[["6c22fb96.b37484"]]},{"id":"6c22fb96.b37484","type":"change","z":"4318847d.0693cc","name":"initiate next","rules":[{"t":"set","p":"releaseNext","pt":"msg","to":"true","tot":"bool"}],"action":"","property":"","from":"","to":"","reg":false,"x":1101,"y":1599,"wires":[["c6772716.60af68"]]},{"id":"c6772716.60af68","type":"function","z":"4318847d.0693cc","name":"queue","func":"// modified version - originally from https://gist.github.com/dceejay/cea8afa28b7a93ebdc0f \n\n// restartQueue = create new\nif (msg.hasOwnProperty(\"restartQueue\")) {\n    context.queue = []\n    \n// if queue doesn't exist, create it    \n} else {\n    context.queue = context.queue || []\n    context.busy = context.busy || false\n\n    // if the msg is a trigger one release next message\n    if (msg.hasOwnProperty(\"releaseNext\")) {\n        if (context.queue.length > 0) {\n            var m = context.queue.shift()\n            node.status({ fill: 'green', shape: 'dot', text: context.queue.length })\n            return m \n        }\n        else {\n            context.busy = false;\n        }\n    }\n    else {\n        if (context.busy) {\n            // if busy add to queue\n            context.queue.push(msg);\n        }\n        else {\n        // otherwise we are empty so just pass through and set busy flag\n            context.busy = true;\n            node.status({ fill: 'green', shape: 'dot', text: context.queue.length })\n            return msg;\n        }\n    }\n}\nnode.status({ fill: 'green', shape: 'dot', text: context.queue.length })\n\nreturn null;","outputs":1,"noerr":0,"x":1012,"y":1550,"wires":[["7435b64e.0a2fb8"]]},{"id":"b9e60025.3c367","type":"http in","z":"4318847d.0693cc","name":"","url":"/notifications/:mp3file","method":"get","upload":false,"swaggerDoc":"","x":150,"y":1746,"wires":[["86792da2.4cb06"]]},{"id":"ef769238.e5b02","type":"comment","z":"4318847d.0693cc","name":"serve mp3 file for SONOS player","info":"","x":170,"y":1709,"wires":[]},{"id":"86792da2.4cb06","type":"change","z":"4318847d.0693cc","name":"","rules":[{"t":"set","p":"filename","pt":"msg","to":"$globalContext('notification_directory') & '/' & msg.req.params.mp3file","tot":"jsonata"}],"action":"","property":"","from":"","to":"","reg":false,"x":374,"y":1746,"wires":[["c2fa6cb.342c39"]]},{"id":"c2fa6cb.342c39","type":"file in","z":"4318847d.0693cc","name":"","filename":"","format":"","chunk":false,"sendError":false,"encoding":"base64","x":534,"y":1746,"wires":[["a7138852.445228"]]},{"id":"605e5893.1b9518","type":"catch","z":"4318847d.0693cc","name":"","scope":["86792da2.4cb06","c2fa6cb.342c39","a7138852.445228"],"uncaught":false,"x":549,"y":1794,"wires":[["beb5575e.889f28","11576894.2c6de7"]]},{"id":"5f4a3564.9a4dbc","type":"http response","z":"4318847d.0693cc","name":"","statusCode":"","headers":{},"x":829,"y":1745,"wires":[]},{"id":"fa8b69a4.f26918","type":"comment","z":"4318847d.0693cc","name":"Test","info":"http://192.168.178.49:1880/notifications/notification_weather.mp3","x":386,"y":1710,"wires":[]},{"id":"392665f5.7dc97a","type":"inject","z":"4318847d.0693cc","name":"Flush command queue","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":1095,"y":1366,"wires":[["eb9430a5.b1ba6"]]},{"id":"eb9430a5.b1ba6","type":"change","z":"4318847d.0693cc","name":"","rules":[{"t":"set","p":"restartQueue","pt":"msg","to":"true","tot":"bool"}],"action":"","property":"","from":"","to":"","reg":false,"x":1107,"y":1403,"wires":[["c6772716.60af68"]]},{"id":"e9d1d7a9.402848","type":"function","z":"4318847d.0693cc","name":"check globals","func":"// checks existens of requried global variables\n//\nlet value = global.get('system_baseUrl')\nif (!isTruthyAndNotEmptyString(value)) {\n    node.error('global - system_baseUrl not defined')\n    return null\n}\nvalue = global.get('notification_cache')\nif (!isTruthyAndNotEmptyString(value)) {\n    node.error('global - notification_cache not defined')\n    return null\n}\nvalue = global.get('notification_directory')\nif (!isTruthyAndNotEmptyString(value)) {\n    node.error('global - notification_directory not defined')\n    return null\n}\nreturn msg\n\nfunction isTruthyAndNotEmptyString (input) {\n    return !(typeof input === 'undefined' || input === null ||\n      (typeof input === 'number' && !Number.isFinite(input)) || input === '')\n}","outputs":1,"noerr":0,"x":432,"y":1549,"wires":[["cb99335a.e0a0e"]]},{"id":"d3477aba.549be8","type":"comment","z":"4318847d.0693cc","name":"Recommendation: Define globals as permanent","info":"This is done in the settings.js file. \nUncomment the contextStorage paragraph.\nThis will store all context variable on disk.","x":440,"y":1331,"wires":[]},{"id":"993b5c0.98e92a8","type":"inject","z":"4318847d.0693cc","name":"weather","topic":"notification_weather.mp3","payload":"We expect nice weather without any rain. Enjoy the day.","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":450,"y":1655,"wires":[["384278f8.a57c98"]]},{"id":"a7138852.445228","type":"change","z":"4318847d.0693cc","name":"set 200","rules":[{"t":"set","p":"statusCode","pt":"msg","to":"200","tot":"num"}],"action":"","property":"","from":"","to":"","reg":false,"x":664,"y":1746,"wires":[["5f4a3564.9a4dbc"]]},{"id":"beb5575e.889f28","type":"change","z":"4318847d.0693cc","name":"set 404","rules":[{"t":"set","p":"statusCode","pt":"msg","to":"404","tot":"num"},{"t":"set","p":"payload","pt":"msg","to":"error","tot":"msg"}],"action":"","property":"","from":"","to":"","reg":false,"x":675,"y":1794,"wires":[["5f4a3564.9a4dbc"]]},{"id":"11576894.2c6de7","type":"debug","z":"4318847d.0693cc","name":"","active":true,"tosidebar":true,"console":true,"tostatus":false,"complete":"true","targetType":"full","x":670,"y":1829,"wires":[]},{"id":"7435b64e.0a2fb8","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":1161,"y":1550,"wires":[["54925fa5.2dc5e"]]},{"id":"54925fa5.2dc5e","type":"debug","z":"4318847d.0693cc","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":1270,"y":1595,"wires":[]},{"id":"d4793d8e.eecd5","type":"inject","z":"4318847d.0693cc","name":"habit","topic":"notification_habit.mp3","payload":"Don't do unto others what you would not have done unto you. Don't do unto others what you would not have done unto you.","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":1648,"wires":[["60d50c04.dc4f34"]]},{"id":"491bd16d.1212e","type":"comment","z":"4318847d.0693cc","name":"Example 8: Group snapshot","info":"","x":125,"y":1060,"wires":[]},{"id":"52d1f7c1.e35848","type":"inject","z":"4318847d.0693cc","name":"","topic":"queueBackup","payload":"household.remove.sonosplaylist","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":90,"y":1095,"wires":[["d9311d99.f498c"]]},{"id":"95cb2b68.7214d8","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":670,"y":1134,"wires":[["ba48ff29.15c59"]]},{"id":"43d03f0a.512fd","type":"change","z":"4318847d.0693cc","name":"create snapshot","rules":[{"t":"set","p":"payload","pt":"msg","to":"create.snap","tot":"str"},{"t":"set","p":"snapVolumes","pt":"msg","to":"true","tot":"bool"},{"t":"set","p":"snapMutestates","pt":"msg","to":"true","tot":"bool"}],"action":"","property":"","from":"","to":"","reg":false,"x":630,"y":1094,"wires":[["95cb2b68.7214d8"]]},{"id":"e095c253.fc1b1","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":571,"y":1235,"wires":[["572964f2.c187cc"]]},{"id":"572964f2.c187cc","type":"debug","z":"4318847d.0693cc","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":713,"y":1235,"wires":[]},{"id":"ba48ff29.15c59","type":"change","z":"4318847d.0693cc","name":"store in flow, stop","rules":[{"t":"set","p":"recentsnapshot","pt":"flow","to":"payload","tot":"msg"},{"t":"set","p":"payload","pt":"msg","to":"stop","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":860,"y":1094,"wires":[["da231a54.c69008"]]},{"id":"7163589.a72b2a8","type":"change","z":"4318847d.0693cc","name":"play snapshot","rules":[{"t":"set","p":"payload","pt":"msg","to":"group.play.snap","tot":"str"},{"t":"set","p":"topic","pt":"msg","to":"recentsnapshot","tot":"flow"}],"action":"","property":"","from":"","to":"","reg":false,"x":561,"y":1195,"wires":[["e095c253.fc1b1"]]},{"id":"41c7ac74.a2c854","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":450,"y":1134,"wires":[["43d03f0a.512fd"]]},{"id":"4c5efb45.196ff4","type":"inject","z":"4318847d.0693cc","name":"","topic":"","payload":"clear.queue","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":110,"y":1195,"wires":[["5cfc7f18.6f27"]]},{"id":"7f910b16.96cf24","type":"sonos-manage-mysonos","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","name":"","x":353,"y":1235,"wires":[["7163589.a72b2a8"]]},{"id":"5cfc7f18.6f27","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":140,"y":1235,"wires":[["1eb0b341.f8addd"]]},{"id":"1eb0b341.f8addd","type":"change","z":"4318847d.0693cc","name":"restore queue","rules":[{"t":"set","p":"payload","pt":"msg","to":"queue","tot":"str"},{"t":"set","p":"topic","pt":"msg","to":"queueBackup","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":320,"y":1195,"wires":[["7f910b16.96cf24"]]},{"id":"da231a54.c69008","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":890,"y":1134,"wires":[["6324aa0b.dc1234"]]},{"id":"330983f0.916e6c","type":"change","z":"4318847d.0693cc","name":"backup queue","rules":[{"t":"set","p":"payload","pt":"msg","to":"save.queue","tot":"str"},{"t":"set","p":"topic","pt":"msg","to":"queueBackup","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":410,"y":1095,"wires":[["41c7ac74.a2c854"]]},{"id":"d9311d99.f498c","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":232,"y":1095,"wires":[["330983f0.916e6c"]]},{"id":"6324aa0b.dc1234","type":"debug","z":"4318847d.0693cc","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":1060,"y":1134,"wires":[]},{"id":"fc8ec1ee.dada8","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":160,"y":369,"wires":[["6280f87a.0562c8"]]},{"id":"fa5800f0.d6f4c","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":886,"y":71,"wires":[["6bbf67aa.5b6638"]]},{"id":"fad22422.5dcc88","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":273,"y":590,"wires":[["625148f2.018378"]]},{"id":"ab1e13ab.c7d74","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":973,"y":590,"wires":[[]]},{"id":"9cfa79ba.d93968","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":590,"y":793,"wires":[["98119167.abb2e"]]},{"id":"24a0a7e6.ae3b08","type":"sonos-universal","z":"4318847d.0693cc","confignode":"88e9fa70.4a53e8","command":"message","compatibilityMode":true,"name":"","x":905,"y":768,"wires":[[]]},{"id":"d36c728b.5c65a","type":"sonos-universal","z":"4318847d.0693cc","confignode":"32a98882.56e1c8","command":"message","compatibilityMode":true,"name":"","x":543,"y":990,"wires":[[]]},{"id":"243370d4.f112d","type":"debug","z":"4318847d.0693cc","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":744,"y":521,"wires":[]},{"id":"8fbcb11a.9f452","type":"sonos-universal","z":"4318847d.0693cc","confignode":"8d44022c.adb65","command":"message","compatibilityMode":true,"name":"","x":313,"y":471,"wires":[["8978d019.4e76e"]]},{"id":"cd23534c.4dffd","type":"inject","z":"4318847d.0693cc","name":"","topic":"","payload":"player.get.properties","payloadType":"str","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":130,"y":471,"wires":[["8fbcb11a.9f452"]]},{"id":"a6111a85.251f68","type":"sonos-universal","z":"4318847d.0693cc","confignode":"8d44022c.adb65","command":"message","compatibilityMode":true,"name":"","x":914,"y":471,"wires":[[]]},{"id":"88e9fa70.4a53e8","type":"sonos-config","z":"","name":"coordinator","serialnum":"5C-AA-FD-00-22-36:1","ipaddress":"192.168.178.37"},{"id":"32a98882.56e1c8","type":"sonos-config","z":"","name":"bath","serialnum":"00-0E-58-FE-3A-EA:5","ipaddress":"192.168.178.35"},{"id":"8945d5a5.31aef8","type":"polly-config","z":"","name":"pollyaws"},{"id":"8d44022c.adb65","type":"sonos-config","z":"","name":"living","serialnum":"94-9F-3E-C1-3B-99:8","ipaddress":"192.168.178.36"}]is always set to lowercase command!
   */
  async function processInputMsg (node, msg, ipaddress) {
    const sonosPlayer = new Sonos(ipaddress)
    // set baseUrl
    if (!isTruthyAndNotEmptyString(sonosPlayer)) {
      throw new Error(`${NRCSP_ERRORPREFIX} sonos player is undefined`)
    }
    if (!(isValidPropertyNotEmptyString(sonosPlayer, ['host']) &&
      isValidPropertyNotEmptyString(sonosPlayer, ['port']))) {
      throw new Error(`${NRCSP_ERRORPREFIX} ip address or port is missing`)
    }
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}` // usefull for my extensions

    // handle compatibility to older nrcsp version - depreciated 2020-05-25
    const cmdPath = []
    cmdPath.push(node.nrcspCompatibilty ? 'payload' : 'cmd')
    const payloadPath = []
    payloadPath.push(node.nrcspCompatibilty ? 'topic' : 'payload')

    // node dialog overrides msg Store lowercase version in command
    let command
    if (node.nrcspCommand !== 'message') { // command specified in node dialog
      command = node.nrcspCommand
    } else {
      if (!isValidPropertyNotEmptyString(msg, cmdPath)) {
        throw new Error(`${NRCSP_ERRORPREFIX} command is undefined/invalid`)
      }
      command = String(msg[cmdPath[0]])
      command = command.toLowerCase()

      // you may omitt group. prefix - so we add it here
      const REGEX_PREFIX = /^(household|group|player|joiner)/
      if (!REGEX_PREFIX.test(command)) {
        command = `group.${command}`
      }
    }
    msg.backupCmd = command // sets msg.backupCmd - is also used in playerSetEQ

    if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE_UNIVERSAL, command)) {
      throw new Error(`${NRCSP_ERRORPREFIX} command is invalid >>${command} `)
    }
    return COMMAND_TABLE_UNIVERSAL[command](node, msg, payloadPath, sonosPlayer)
  }

  // ========================================================================
  //
  //             COMMANDS
  //
  // ========================================================================

  /**  Play already set content on given group of players.
   * @param  {object}         node only used for debug and warning
   * @param  {object}         msg incoming message
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}         [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}         [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}          payloadPath not used
   * @param  {object}         sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlay (node, msg, payloadPath, sonosPlayer) {
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.play()

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play non empty queue.
   * @param  {object}         node only used for debug and warning
   * @param  {object}         msg incoming message
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {number}         [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}         [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}          payloadPath not used
   * @param  {object}         sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayQueue (node, msg, payloadPath, sonosPlayer) {
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueData = await getPlayerQueue(sonosCoordinator)
    if (queueData.length === 0) {
      // queue is empty
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }
    await sonosCoordinator.selectQueue()

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play a specific track in queue. Queue must not be empty.
   * @param  {object}         node only used for debug and warning
   * @param  {object}         msg incoming message
   * @param  {string/number}  msg.[payloadPath[0]] position of track in queue. 1 ... queueLenght.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}        [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}         [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}          payloadPath default: payload - in compatibility mode: topic
   * @param  {object}         sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayTrack (node, msg, payloadPath, sonosPlayer) {
    // get the playerName
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = await getPlayerQueue(sonosCoordinator)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }
    // payload position is required
    const validatedPosition = string2ValidInteger(msg, payloadPath[0], 1, lastTrackInQueue, 'position in queue', NRCSP_ERRORPREFIX)
    await sonosCoordinator.selectQueue()
    await sonosCoordinator.selectTrack(validatedPosition)

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play data being exported form My Sonos (uri/metadata) on a gvien group of players
   * @param  {object}   node only used for debug and warning
   * @param  {object}   msg incoming message
   * @param  {string}   msg.export content to be played
   * @param  {string}   msg.export.uri uri to be played/queued
   * @param  {boolean}  msg.export.queue indicator: has to be queued
   * @param  {string}   [msg.export.metadata] metadata in case of queue = true
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean}  [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {boolean}  [msg.clearQueue] if true and export.queue = true the queue is cleared. Default is true.
   * @param  {string}   [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}    payloadPath not used
   * @param  {object}   sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws  any functions throws error and explicit throws
   */
  async function groupPlayExport (node, msg, payloadPath, sonosPlayer) {
    // simple validation of export and activation
    if (!isValidPropertyNotEmptyString(msg, ['export', 'queue'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue identifier is missing`)
    }
    if (!isValidPropertyNotEmptyString(msg, ['export', 'uri'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} uri is missing`)
    }

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }

    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`
    if (msg.export.queue) {
      if (validated.clearQueue) {
        await sonosCoordinator.flush()
      }
      await sonosCoordinator.queue({ uri: msg.export.uri, metadata: msg.export.metadata })
      await sonosCoordinator.selectQueue()
    } else {
      await sonosCoordinator.setAVTransportURI(msg.export.uri)
    }
    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play tuneIn station. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] TuneIn id
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean} [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws  all from validatedGroupProperties
   *          all from getGroupMemberDataV2
   *          if msg.sameVolume === false and player == standalone because non sense.
   */
  async function groupPlayTuneIn (node, msg, payloadPath, sonosPlayer) {
    // payload radio id is required
    const validatedRadioid = stringValidRegex(msg, payloadPath[0], REGEX_RADIO_ID, 'radio id', NRCSP_ERRORPREFIX)
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.playTuneinRadio(validatedRadioid)

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play stream from http. Optional set volume, use playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] http uri.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean} [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPlayStreamHttp (node, msg, payloadPath, sonosPlayer) {
    // payload uri is required.
    const validatedUri = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    if (validated.sameVolume === false && groupData.members.length === 1) {
      throw new Error(`${NRCSP_ERRORPREFIX} msg.sameVolume is nonsense: player is standalone`)
    }
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.setAVTransportURI(validatedUri)

    if (validated.volume !== -1) {
      let sonosSinglePlayer
      if (validated.sameVolume) {
        for (let index = 0; index < groupData.members.length; index++) {
          sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
          // baseUrl not needed
          await sonosSinglePlayer.setVolume(validated.volume)
        }
      } else {
        sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
        // baseUrl not needed
        await sonosSinglePlayer.setVolume(validated.volume)
      }
    }
    return {}
  }

  /**  Play notification on a given group of players. Group topology will not being touched.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] notification uri.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {boolean} [msg.sameVolume] shall all players play at same volume level. If missing all group members play at same volume level
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {string}  [msg.duration] duration of notification hh:mm:ss - default is calculation, if that fails then 00:00:05
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Hint:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this group.
   */
  async function groupPlayNotification (node, msg, payloadPath, sonosPlayer) {
    // payload uri is required.
    const validatedUri = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const options = { // set defaults
      uri: validatedUri,
      volume: validated.volume,
      sameVolume: validated.sameVolume,
      automaticDuration: true,
      duration: '00:00:05' // in case automaticDuration does not work - 5 seconds
    }

    // update options.duration - get info from SONOS
    if (isValidProperty(msg, ['duration'])) {
      if (typeof msg.duration !== 'string') {
        throw new Error(`${NRCSP_ERRORPREFIX} duration (msg.duration) is not a string`)
      }
      if (!REGEX_TIME.test(msg.duration)) {
        throw new Error(`${NRCSP_ERRORPREFIX} duration (msg.duration) is not format hh:mm:ss`)
      }
      options.duration = msg.duration
      options.automaticDuration = false
    }

    const membersPlayerPlus = []
    let sonosSinglePlayer = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
      sonosSinglePlayer.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosSinglePlayer)
    }
    await playGroupNotification(node, membersPlayerPlus, options)
    return {}
  }

  /**  Play notification on a joiner (in group) specified by sonosPlayer (default) or by playerName.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] notification uri.
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {string}  [msg.duration] duration of notification hh:mm:ss - default is calculation, if that fails then 00:00:05
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Hints:
   *  While playing a notification (start .. to end + 2 seconds)
   *     there should not be send another request to this player and the group shound be modified
   */
  async function joinerPlayNotification (node, msg, payloadPath, sonosPlayer) {
    // payload notification uri is required.
    const validatedUri = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    // verify that player is joiner and not a coordinator
    if (groupData.playerIndex === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} player (msg.player/node) is not a joiner`)
    }

    // msg.sameVolume is not used (only one player!)
    const options = { // set defaults
      uri: validatedUri,
      volume: validated.volume, // means dont touch
      automaticDuration: true,
      duration: '00:00:05' // in case automaticDuration does not work - 5 seconds
    }

    // update options.duration - get info from SONOS player
    if (isValidProperty(msg, ['duration'])) {
      if (typeof msg.duration !== 'string') {
        throw new Error(`${NRCSP_ERRORPREFIX} duration (msg.duration) is not a string`)
      }
      if (!REGEX_TIME.test(msg.duration)) {
        throw new Error(`${NRCSP_ERRORPREFIX} duration (msg.duration) is not format hh:mm:ss`)
      }
      options.duration = msg.duration
      options.automaticDuration = false
    }

    // The coordinator is being used to capture group status (playing, content, ...)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl

    const sonosJoiner = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosJoiner.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    await playJoinerNotification(node, sonosCoordinator, sonosJoiner, options)
    return {}
  }

  /**  Play a given snapshot on the given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {object}  msg.[payloadPath[0]] snapshot - output form groupCreateSnapshot
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Assumption: payload is valid - not checked.
   */
  async function groupPlaySnapshot (node, msg, payloadPath, sonosPlayer) {
    if (isValidProperty(msg, payloadPath)) {
      if (typeof msg[payloadPath[0]] !== 'object') {
        throw new Error(`${NRCSP_ERRORPREFIX}: snapshot (msg.${payloadPath[0]}) is not object`)
      }
    } else {
      throw new Error(`${NRCSP_ERRORPREFIX}: snapshot (msg.${payloadPath[0]}) is missing`)
    }
    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const membersPlayerPlus = []
    let sonosSinglePlayer = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
      sonosSinglePlayer.baseUrl = groupData.members[index].baseUrl
      membersPlayerPlus.push(sonosSinglePlayer)
    }
    const snap = msg[payloadPath[0]]
    await restoreGroupSnapshot(node, membersPlayerPlus, snap)
    if (snap.wasPlaying) {
      await membersPlayerPlus[0].play() // 0 stands for coordinator
    }
    return {}
  }

  /**  Player play AVTransport uri: LineIn, TV
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] extended uri x-***:
   * @param  {number/string}  [msg.volume] volume - if missing do not touch volume
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  async function playerPlayAvtransport (node, msg, payloadPath, sonosPlayer) {
    // payload uri is required: eg x-rincon-stream:RINCON_5CAAFD00223601400 for line in
    const validatedUri = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'uri', NRCSP_ERRORPREFIX)

    // validate msg.playerName, msg.volume
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.setAVTransportURI(validatedUri)
    if (validated.volume !== -1) {
      await sonosSinglePlayer.setVolume(validated.volume)
    }
    return {}
  }

  /**  Toggle playback on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupTogglePlayback (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.togglePlayback()
    return {}
  }

  /**  Pause playing in that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPause (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.pause()
    return {}
  }

  /**  Stop playing in that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupStop (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    await sonosCoordinator.stop()
    return {}
  }

  /**  Play next track on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupNextTrack (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.next()
    return {}
  }

  /**  Play previous track on given group of players.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupPreviousTrack (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.previous()
    return {}
  }

  /**  Adjust group volume
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg[payloadPaht[0]] +/- 1 .. 99 integer
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupAdjustVolume (node, msg, payloadPath, sonosPlayer) {
    // payload adusted volume is required
    const adjustVolume = string2ValidInteger(msg, payloadPath[0], -99, +99, 'adjust volume', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupVolumeRelative(groupData.members[0].baseUrl, adjustVolume) // 0 stands for coordinator
    return {}
  }

  /**  Adjust player volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string/number}  msg.[payloadPath[0]] +/- 1 .. 99 integer.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerAdjustVolume (node, msg, payloadPath, sonosPlayer) {
    // payload volume is required.
    const adjustVolume = string2ValidInteger(msg, payloadPath[0], -99, +99, 'adjust volume', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.adjustVolume(adjustVolume)
    return {}
  }

  /**  Set volume for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {number/string} msg.[payloadPath[0]] volume, integer 1 .. 99 integer.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetVolume (node, msg, payloadPath, sonosPlayer) {
    // payload volume is required.
    const validatedVolume = string2ValidInteger(msg, payloadPath[0], 1, +99, 'volume', NRCSP_ERRORPREFIX)
    const validatedPlayerName = stringValidRegex(msg, 'playerName', REGEX_ANYCHAR, 'player name', NRCSP_ERRORPREFIX, '')
    const groupData = await getGroupMemberDataV2(sonosPlayer, validatedPlayerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.setVolume(validatedVolume)
    return {}
  }

  /**  Set group mute state.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetMute (node, msg, payloadPath, sonosPlayer) {
    // payload mute state is required.
    const newState = onOff2boolean(msg, payloadPath[0], 'mute state', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setGroupMute(groupData.members[0].baseUrl, newState) // 0 stands for coordinator
    return {}
  }

  /**  Set mute for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetMute (node, msg, payloadPath, sonosPlayer) {
    // payload mute state is required.
    const newState = onOff2boolean(msg, payloadPath[0], 'mute state', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.setMuted(newState)
    return {}
  }

  /**  Set group queuemode - queue must being activated and must not be empty.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] queue modes.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetQueuemode (node, msg, payloadPath, sonosPlayer) {
    // payload queuemode is required.
    const newState = stringValidRegex(msg, payloadPath[0], REGEX_QUEUEMODES, 'queue mode', NRCSP_ERRORPREFIX)

    // check queue is not empty and activated
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos((groupData.members[0].urlHostname))
    sonosCoordinator.baseUrl = groupData.members[0].urlHostname
    const queueItems = await getPlayerQueue(sonosCoordinator)
    if (queueItems.length === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }
    const mediaData = await sonosCoordinator.avTransportService().GetMediaInfo()
    if (!isTruthyAndNotEmptyString(mediaData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current media data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(mediaData, ['CurrentURI'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    if (!uri.startsWith('x-rincon-queue')) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is not activated`)
    }
    await sonosCoordinator.setPlayMode(newState)
    return {}
  }

  /**  Group seek to specific time.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] hh:mm:ss time in song.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSeek (node, msg, payloadPath, sonosPlayer) {
    // payload seek time is required.
    const validTime = stringValidRegex(msg, payloadPath[0], REGEX_TIME, 'seek time', NRCSP_ERRORPREFIX)
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[0].baseUrl, 'Seek', { Target: validTime }) // 0 stands for coordinator
    return {}
  }

  /**  Set group sleep timer.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] hh:mm:ss time in song.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetSleeptimer (node, msg, payloadPath, sonosPlayer) {
    // payload sleep time is required.
    const validTime = stringValidRegex(msg, payloadPath[0], REGEX_TIME, 'timer duration', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[0].baseUrl, 'ConfigureSleepTimer', { NewSleepTimerDuration: validTime }) // 0 stands for coordinator
    return {}
  }

  /**  Set group crossfade on/off.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSetCrossfade (node, msg, payloadPath, sonosPlayer) {
    // payload crossfade sate is required.
    let newState = onOff2boolean(msg, payloadPath[0], 'crosssfade state', NRCSP_ERRORPREFIX)
    newState = (newState ? 1 : 0)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    await setCmd(groupData.members[0].baseUrl, 'SetCrossfadeMode', { CrossfadeMode: newState }) // 0 stands for coordinator
    return {}
  }

  /**  Set player led on/off.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetLed (node, msg, payloadPath, sonosPlayer) {
    // msg.state is required
    let newState = onOff2boolean(msg, payloadPath[0], 'led state', NRCSP_ERRORPREFIX)
    newState = newState ? 'On' : 'Off'

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed

    await sonosSinglePlayer.setLEDState(newState)
    return {}
  }

  /**  Set player loudness on/off
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] on/off
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}  payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetLoudness (node, msg, payloadPath, sonosPlayer) {
    // msg.state is required
    let newState = onOff2boolean(msg, payloadPath[0], 'loudness state', NRCSP_ERRORPREFIX)
    newState = (newState ? 1 : 0)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await setCmd(groupData.members[groupData.playerIndex].baseUrl, 'SetLoudness', { DesiredLoudness: newState })
    return {}
  }

  /**  Set player EQ type
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.backupCmd the lowercase, player.set.nightmode/subgain/dialoglevel
   * @param  {string}  msg.[payloadPath[0]] value on,off or -15 .. 15 in case of subgain
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerSetEQ (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl

    // verify that player has a TV mode
    const properties = await sonosSinglePlayer.deviceDescription()
    if (!isValidPropertyNotEmptyString(properties, ['modelName'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} Sonos player model name undefined`)
    }
    if (!PLAYER_WITH_TV.includes(properties.modelName)) {
      throw new Error(`${NRCSP_ERRORPREFIX} Selected player does not support TV`)
    }

    let eqType
    let eqValue

    // we use msg.backupCmd to split

    if (msg.backupCmd === 'player.set.nightmode') {
      eqType = 'NightMode'
      eqValue = onOff2boolean(msg, payloadPath[0], 'nightmode', NRCSP_ERRORPREFIX) // required
      eqValue = (eqValue ? 1 : 0)
    } else if (msg.backupCmd === 'player.set.subgain') {
      eqType = 'SubGain'
      eqValue = string2ValidInteger(msg, payloadPath[0], -15, 15, 'subgain', NRCSP_ERRORPREFIX) // required
    } else {
      eqType = 'DialogLevel'
      eqValue = onOff2boolean(msg, payloadPath[0], 'dialoglevel', NRCSP_ERRORPREFIX) // required
      eqValue = (eqValue ? 1 : 0)
    }

    const args = { EQType: eqType, DesiredValue: eqValue }
    await setCmd(groupData.members[groupData.playerIndex].baseUrl, 'SetEQ', args)
    return {}
  }

  /**  Create a snapshot of the given group of players.
   * @param  {object}  node only used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {boolean} [msg.snapVolumes = false] will capture the players volumes
   * @param  {boolean} [msg.snapMutestate = false] will capture the players mutestates
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player
   *
   * @return {promise}  {payload: snap} snap see createGroupSnapshot
   *
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupCreateSnapshot (node, msg, payloadPath, sonosPlayer) {
    // validate msg properties
    const options = { snapVolumes: false, snapMutestates: false } // default
    if (isValidProperty(msg, ['snapVolumes'])) {
      if (typeof msg.snapVolumes !== 'boolean') {
        throw new Error(`${NRCSP_ERRORPREFIX}: snapVolumes indicator (msg.snapVolumes) is not boolean`)
      }
      options.snapVolumes = msg.snapVolumes
    }
    if (isValidProperty(msg, ['snapMutestates'])) {
      if (typeof msg.snapVolumes !== 'boolean') {
        throw new Error(`${NRCSP_ERRORPREFIX}: snapMutestates indicator (msg.snapMutestates) is not boolean`)
      }
      options.snapMutestates = msg.snapMutestates
    }

    // validate msg.playerName, msg.volume, msg.sameVolume -error are thrown
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const sonosPlayermembers = []
    let sonosSinglePlayer = {}
    for (let index = 0; index < groupData.members.length; index++) {
      sonosSinglePlayer = new Sonos(groupData.members[index].urlHostname)
      sonosSinglePlayer.baseUrl = groupData.members[index].baseUrl
      sonosPlayermembers.push(sonosSinglePlayer)
    }
    const snap = await createGroupSnapshot(node, sonosPlayermembers, options)
    return { payload: snap }
  }

  /**  Save SONOS queue to Sonos playlist.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] title of Sonos playlist.
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupSaveQueueToSonosPlaylist (node, msg, payloadPath, sonosPlayer) {
    // payload title search string is required.
    const validatedTitle = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'title', NRCSP_ERRORPREFIX)

    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    await saveQueue(groupData.members[0].baseUrl, validatedTitle) // 0 stands for coordinator
    return {}
  }

  /**  Clear queue.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupClearQueue (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    await sonosCoordinator.flush()
    return {}
  }

  /**  Remove a number of tracks in queue.
   * @param  {object}         node only used for debug and warning
   * @param  {object}         msg incoming message
   * @param  {string/number}  msg.[payloadPath[0]] number of track in queue. 1 ... queueLenght.
   * @param  {number/string}  msg.numberOfTracks number of track 1 ... queuelenght. If missing 1.
   * @param  {string}         [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}          payloadPath default: payload - in compatibility mode: topic
   * @param  {object}         sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupRemoveTracks (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    // get the number of tracks in queue - should be > 0
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = await getPlayerQueue(sonosCoordinator)
    const lastTrackInQueue = queueItems.length
    if (lastTrackInQueue === 0) {
      throw new Error(`${NRCSP_ERRORPREFIX} queue is empty`)
    }

    // payload track position is required.
    const validatedPosition = string2ValidInteger(msg, payloadPath[0], 1, lastTrackInQueue, 'position in queue', NRCSP_ERRORPREFIX)
    const validatedNumberofTracks = string2ValidInteger(msg, 'numberOfTracks', 1, lastTrackInQueue, 'number of tracks', NRCSP_ERRORPREFIX, 1)
    await sonosCoordinator.removeTracksFromQueue(validatedPosition, validatedNumberofTracks)
    return {}
  }

  /**  Remove Sonos playlist with given title. (impact on My Sonos and also Sonos playlist list)
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] title of Sonos playlist.
   * @param  {boolean} [msg.ignoreNotExists] if missing assume true
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdRemoveSonosPlaylist (node, msg, payloadPath, sonosPlayer) {
    // payload title search string is required.
    const validatedTitle = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'title', NRCSP_ERRORPREFIX)

    let ignoreNotExists = true
    if (isValidProperty(msg, ['ignoreNotExists'])) {
      if (typeof msg.volume !== 'boolean') {
        throw new Error(`${NRCSP_ERRORPREFIX}: msg.ignoreNotExists is not boolean`)
      }
      ignoreNotExists = msg.ignoreNotExist
    }

    // using the default player of this node as all
    const playLists = await getAllSonosPlaylists(sonosPlayer.baseUrl)

    if (!isTruthy(playLists)) {
      throw new Error(`${NRCSP_ERRORPREFIX}: Sonos playlist list is invalid`)
    }
    // find title in playlist - exact - return id
    let id = ''
    for (var i = 0; i < playLists.length; i++) {
      if (playLists[i].title === validatedTitle) {
        id = playLists[i].id.replace('SQ:', '')
      }
    }
    if (id === '') { // not found
      if (!ignoreNotExists) {
        throw new Error(`${NRCSP_ERRORPREFIX} No Sonos playlist title matching search string.`)
      }
    } else {
      await sonosPlayer.deletePlaylist(id)
    }
    return {}
  }

  /**  Join a group.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] SONOS name of any player in the group
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * Details: if coordinator: will leave old group and join new group.
   * If already in that group - it will just continue.
   * if coordinator of that group - no action and continue
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerJoinGroup (node, msg, payloadPath, sonosPlayer) {
    // payload a playername in group is required
    const validatedGroupPlayerName = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'group player name', NRCSP_ERRORPREFIX)

    // get coordinator uri/rincon of the target group
    const groupDataToJoin = await getGroupMemberDataV2(sonosPlayer, validatedGroupPlayerName)
    const coordinatorRincon = `x-rincon:${groupDataToJoin.members[0].uuid}`

    // get the ip address of joiner
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupDataJoiner = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    if (groupDataJoiner.members[groupDataJoiner.playerIndex].sonosName !== groupDataToJoin.members[0].sonosName) {
      const sonosSinglePlayer = new Sonos(groupDataJoiner.members[groupDataJoiner.playerIndex].urlHostname)
      // baseUrl not needed
      await sonosSinglePlayer.setAVTransportURI({ uri: coordinatorRincon, onlySetUri: true })
    } // else: do nothing - either playerName is already coordinator

    return {}
  }

  /**  Leave a group - means become a standalone player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * Details: if coordinator => will leave group (stop playing), another will take over coordinator role
   * if standalone - no change
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerLeaveGroup (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    await sonosSinglePlayer.leaveGroup()
    return {}
  }

  /**  Create a stereo pair of players. Right one will be hidden! Is only support for some type of SONOS player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] - left player, will be visible
   * @param  {string}  msg.playerNameRight - right player, will become invisible
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   * Caution: In setCmd it should be left: playerLeftBaseUrl
   *
   */
  async function householdCreateStereoPair (node, msg, payloadPath, sonosPlayer) {
    // both player are requried
    const playerLeft = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'player name left', NRCSP_ERRORPREFIX)
    const playerRight = stringValidRegex(msg, 'playerNameRight', REGEX_ANYCHAR, 'player name right', NRCSP_ERRORPREFIX)

    // verify that playerNames are valid and get the uuid
    const allGroupsData = await sonosPlayer.getAllGroups()
    let playerRightUuid = ''
    let playerLeftUuid = ''
    let playerLeftBaseUrl
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data undefined`)
    }
    if (!Array.isArray(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data is not array`)
    }
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let name
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        name = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
        if (name === playerRight) {
          playerRightUuid = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID
        }
        if (name === playerLeft) {
          playerLeftUuid = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID
          const playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
          playerLeftBaseUrl = `http://${playerUrl.host}`
        }
      }
    }
    if (playerLeftUuid === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name left was not found`)
    }
    if (playerRightUuid === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name right was not found`)
    }
    await setCmd(playerLeftBaseUrl, 'CreateStereoPair', { ChannelMapSet: `${playerLeftUuid}:LF,LF;${playerRightUuid}:RF,RF` })
    return {}
  }

  /**  Seperate a stereo pair of players. Right player will become visible again.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] - left player, will be visible
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {}
   *
   * @throws any functions throws error and explicit throws
   *
   */
  async function householdSeparateStereoPair (node, msg, payloadPath, sonosPlayer) {
    // player left is required
    const playerLeft = stringValidRegex(msg, payloadPath[0], REGEX_ANYCHAR, 'player name left', NRCSP_ERRORPREFIX)

    // verify that playerNames are valid and get the uuid
    const allGroupsData = await sonosPlayer.getAllGroups()
    let playerLeftUuid = ''
    let playerLeftBaseUrl
    let playerRightUuid = ''
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data undefined`)
    }
    if (!Array.isArray(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data is not array`)
    }
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let name
    let playerUuid
    let playerChannelMap
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        name = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
        if (name === playerLeft) {
          // Both player have same name. Get the left one
          playerUuid = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].UUID
          playerChannelMap = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ChannelMapSet
          if (playerChannelMap.startsWith(playerUuid)) {
            playerLeftUuid = playerUuid
            const playerUrl = new URL(allGroupsData[groupIndex].ZoneGroupMember[memberIndex].Location)
            playerLeftBaseUrl = `http://${playerUrl.host}`
            // TODO check exist ;
            playerRightUuid = playerChannelMap.split(';')[1]
            playerRightUuid = playerRightUuid.replace(':RF,RF', '')
          }
        }
      }
    }
    if (playerLeftUuid === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name left was not found`)
    }
    if (playerRightUuid === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name right was not found`)
    }
    await setCmd(playerLeftBaseUrl, 'SeparateStereoPair', { ChannelMapSet: `${playerLeftUuid}:LF,LF;${playerRightUuid}:RF,RF` })
    return {}
  }

  /**  Get household groups
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   * @param  {array}   payloadPath not used
   *
   * @return {promise} array of all group array of members :-)
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdGetGroups (node, msg, payloadPath, sonosPlayer) {
    const allGroupsData = await sonosPlayer.getAllGroups()
    const allGroupsArray = []
    let group
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      group = await sortedGroupArray(allGroupsData, groupIndex)
      allGroupsArray.push(group)
    }
    return { payload: allGroupsArray }
  }

  /**  Get state (see return) of that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { see return }
   * state: { STOPPED: 'stopped', PLAYING: 'playing', PAUSED_PLAYBACK: 'paused', TRANSITIONING: 'transitioning', NO_MEDIA_PRESENT: 'no_media' }
   * queue mode: 'NORMAL', 'REPEAT_ONE', 'REPEAT_ALL', 'SHUFFLE', 'SHUFFLE_NOREPEAT', 'SHUFFLE_REPEAT_ONE'
   * First is the SONOS response, that is translated by node-sonos.
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetState (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const playbackstate = await sonosCoordinator.getCurrentState()
    const muteState = await getGroupMute(sonosCoordinator.baseUrl)
    const volume = await getGroupVolume(sonosCoordinator.baseUrl)

    // get current media data and extract queueActivated, radioId
    const mediaData = await sonosCoordinator.avTransportService().GetMediaInfo()
    if (!isTruthyAndNotEmptyString(mediaData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current media data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(mediaData, ['CurrentURI'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    const queueActivated = uri.startsWith('x-rincon-queue')

    // queue mode
    const queueMode = await sonosCoordinator.getPlayMode()
    if (!isTruthyAndNotEmptyString(queueMode)) {
      throw new Error(`${NRCSP_ERRORPREFIX} could not get queue mode from player`)
    }

    return {
      payload: {
        playbackstate: playbackstate,
        coordinatorName: groupData.members[0].sonosName, // 0 stands for coordinator
        volume: volume,
        muteState: muteState,
        queueActivated: queueActivated,
        queueMode: queueMode,
        members: groupData.members,
        size: groupData.members.length,
        id: groupData.groupId,
        name: groupData.groupName
      }
    }
  }

  /**  Get the playback state of that group, the specified player belongs to.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} { payload: state, cmd: msg.payload }
   * state: { STOPPED: 'stopped', PLAYING: 'playing', PAUSED_PLAYBACK: 'paused', TRANSITIONING: 'transitioning', NO_MEDIA_PRESENT: 'no_media' }
   * First is the SONOS response, that is translated by node-sonos.
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetPlaybackstate (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed
    const playbackstate = await sonosCoordinator.getCurrentState()
    return { payload: playbackstate }
  }

  /**  Get group volume.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @output {promise}  { payload: groupVolume}
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetVolume (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const volume = await getGroupVolume(groupData.members[0].baseUrl) // 0 stands for coordinator
    return { payload: volume }
  }

  /**  Get volume of given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @output {payload: volume } range 0 .. 100
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetVolume (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    const volume = await sonosSinglePlayer.getVolume()
    return { payload: volume }
  }

  /**  Get group mute.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: muteState} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetMute (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const muteState = await getGroupMute(groupData.members[0].baseUrl) // 0 stands for coordinator
    return { payload: muteState.toLowerCase() }
  }

  /**  Get mute state for given player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: muteState} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetMute (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    // baseUrl not needed
    const state = await sonosSinglePlayer.getMuted()
    return { payload: (state ? 'on' : 'off') }
  }

  /**  Get group crossfade mode.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: crossfade mode} on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetCrossfadeMode (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const state = await getCmd(groupData.members[0].baseUrl, 'GetCrossfadeMode') // 0 stands for coordinator
    return { payload: (state === '1' ? 'on' : 'off') }
  }

  /**  Get group sleeptimer.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: crossfade mode} hh:mm:ss
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetSleeptimer (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sleeptimer = await getCmd(groupData.members[0].baseUrl, 'GetRemainingSleepTimerDuration') // 0 stands for coordinator
    return { payload: (sleeptimer === '' ? 'no time set' : sleeptimer) }
  }

  /**  Get the role and name of a player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload to role of player as string.
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetRole (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    let role
    if (groupData.members.length === 1) {
      role = 'standalone'
    } else {
      if (groupData.playerIndex === 0) {
        role = 'coordinator'
      } else {
        role = 'joiner'
      }
    }
    return { payload: role, playerName: groupData.members[groupData.playerIndex].sonosName }
  }

  /**  Get group SONOS queue - the SONOS queue of the coordinator.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetQueue (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    sonosCoordinator.baseUrl = groupData.members[0].baseUrl
    const queueItems = await getPlayerQueue(sonosCoordinator)
    return { payload: queueItems }
  }

  /**  Get the SONOS queue of the specified player.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload = array of queue items as object
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetQueue (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const queueItems = await getPlayerQueue(sonosSinglePlayer)
    return { payload: queueItems }
  }

  /**  Get player LED state.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update payload the LED state on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetLed (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const ledState = await sonosSinglePlayer.getLEDState()
    if (!isTruthyAndNotEmptyString(ledState)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    return { payload: ledState.toLowerCase() }
  }

  /**  Get player properties.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the properties object
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetProperties (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl
    const properties = await sonosSinglePlayer.deviceDescription()
    properties.uuid = properties.UDN.substring('uuid:'.length)
    properties.playerName = properties.roomName
    if (!isTruthyAndNotEmptyString(properties)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    return { payload: properties }
  }

  /**  Get player loudness.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the Loudness state LED state on/off
   *
   * @throws any functions throws error and explicit throws
   */
  async function playerGetLoudness (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)

    const loudness = await getCmd(groupData.members[groupData.playerIndex].baseUrl, 'GetLoudness')
    if (!isTruthyAndNotEmptyString(loudness)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    return { payload: (loudness === '1' ? 'on' : 'off') }
  }

  /**  Get player EQ data.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} object to update msg. msg.payload the Loudness state LED state on/off
   *
   * @throws any functions throws error and explicit throws
   *
   * EQ data are only available for specific players.
   */
  async function playerGetEq (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosSinglePlayer = new Sonos(groupData.members[groupData.playerIndex].urlHostname)
    sonosSinglePlayer.baseUrl = groupData.members[groupData.playerIndex].baseUrl

    // verify that player has a TV mode
    const properties = await sonosSinglePlayer.deviceDescription()
    if (!isValidPropertyNotEmptyString(properties, ['modelName'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} Sonos player model name undefined`)
    }
    if (!PLAYER_WITH_TV.includes(properties.modelName)) {
      throw new Error(`${NRCSP_ERRORPREFIX} Selected player does not support TV`)
    }

    let eqType
    if (msg.payload === 'player.get.nightmode') {
      eqType = 'NightMode'
    } else if (msg.payload === 'player.get.subgain') {
      eqType = 'SubGain'
    } else {
      eqType = 'DialogLevel'
    }
    let eqData = await getCmd(sonosPlayer.baseUrl, `GetEQ-${eqType}`)
    if (!isTruthyAndNotEmptyString(eqData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player response is undefined`)
    }
    if (eqType !== 'SubGain') {
      eqData = (eqData === '1' ? 'on' : 'off')
    }

    return { payload: eqData }
  }

  /**  Household test player connection
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  msg.[payloadPath[0]] SONOS player name, required!!!!
   * @param  {array}   payloadPath default: payload - in compatibility mode: topic
   * @param  {object}  sonosPlayer Sonos playerault as anchor player
   *
   * @return {promise} true | false
   *
   * Caution: sonosPlayer can not be used here as default for input.
   * It should be a "always on always available" player.
   *
   * @throws any functions throws error and explicit throws
   */
  async function householdTestPlayerOnline (node, msg, payloadPath, sonosPlayer) {
    // player name is required
    if (!isValidProperty(msg, payloadPath)) {
      throw new Error(`${NRCSP_ERRORPREFIX} player name (msg.${payloadPath[0]}) is missing/invalid`)
    }
    const playerToBeTested = msg[payloadPath[0]]
    if (typeof playerToBeTested !== 'string' || playerToBeTested === '') {
      throw new Error(`${NRCSP_ERRORPREFIX} player name (msg.${payloadPath[0]}) is not string or empty`)
    }
    const allGroupsData = await sonosPlayer.getAllGroups()
    if (!isTruthyAndNotEmptyString(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data undefined`)
    }
    if (!Array.isArray(allGroupsData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} all groups data is not array`)
    }

    // find our player in groups output
    // allGroupsData is an array of groups. Each group has properties ZoneGroupMembers, host (IP Address), port, baseUrl, coordinater (uuid)
    // ZoneGroupMembers is an array of all members with properties ip address and more
    let name
    for (let groupIndex = 0; groupIndex < allGroupsData.length; groupIndex++) {
      for (let memberIndex = 0; memberIndex < allGroupsData[groupIndex].ZoneGroupMember.length; memberIndex++) {
        name = allGroupsData[groupIndex].ZoneGroupMember[memberIndex].ZoneName
        if (name === playerToBeTested) {
          return { payload: true }
        }
      }
    }
    return { payload: false }
  }

  /**  Get group track media position info.
   * @param  {object}  node - used for debug and warning
   * @param  {object}  msg incoming message
   * @param  {string}  [msg.playerName] SONOS player name - if missing uses sonosPlayer
   * @param  {array}   payloadPath not used
   * @param  {object}  sonosPlayer Sonos player - as default and anchor player
   *
   * @return {promise} {payload: media: {object}, trackInfo: {object}, positionInfo: {object}, queueActivated: true/false
   *
   * @throws any functions throws error and explicit throws
   */
  async function groupGetTrackPlus (node, msg, payloadPath, sonosPlayer) {
    const validated = await validatedGroupProperties(msg, NRCSP_ERRORPREFIX)
    const groupData = await getGroupMemberDataV2(sonosPlayer, validated.playerName)
    const sonosCoordinator = new Sonos(groupData.members[0].urlHostname)
    // baseUrl not needed

    // get currentTrack data and extract artist, title. Add baseUrl to albumArtURL.
    const trackData = await sonosCoordinator.currentTrack()
    let artist = 'unknown' // as default
    let title = 'unknown' // as default
    let albumArtURL = ''
    if (!isTruthyAndNotEmptyString(trackData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current track data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(trackData, ['albumArtURI'])) {
      // TuneIn does not provide AlbumArtURL -so we continue
    } else {
      node.debug('got valid albumArtURI')
      albumArtURL = sonosPlayer.baseUrl + trackData.albumArtURI
    }
    // extract artist and title if available
    if (!isValidPropertyNotEmptyString(trackData, ['artist'])) {
      // missing artist: TuneIn provides artist and title in title field
      if (!isValidPropertyNotEmptyString(trackData, ['title'])) {
        node.debug('Warning: no artist, no title', 'received-> ' + JSON.stringify(trackData))
      } else {
        if (trackData.title.indexOf(' - ') > 0) {
          node.debug('split data to artist and title')
          artist = trackData.title.split(' - ')[0] // 0 stands for coordinator
          title = trackData.title.split(' - ')[1]
        } else {
          node.debug('Warning: invalid combination artist title receive')
          title = trackData.title
        }
      }
    } else {
      artist = trackData.artist
      if (!isValidPropertyNotEmptyString(trackData, ['title'])) {
        // title unknown - use unknown
      } else {
        node.debug('got artist and title')
        title = trackData.title
      }
    }
    node.debug('got valid song info')

    // get current media data and extract queueActivated, radioId
    const mediaData = await sonosCoordinator.avTransportService().GetMediaInfo()
    if (!isTruthyAndNotEmptyString(mediaData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current media data is invalid`)
    }
    if (!isValidPropertyNotEmptyString(mediaData, ['CurrentURI'])) {
      throw new Error(`${NRCSP_ERRORPREFIX} CurrentUri is invalid`)
    }
    const uri = mediaData.CurrentURI
    const queueActivated = uri.startsWith('x-rincon-queue')
    let radioId = ''
    if (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=254')) {
      const end = uri.indexOf('?sid=254')
      const start = 'x-sonosapi-stream:'.length
      radioId = uri.substring(start, end)
    }

    // get current position data
    const positionData = await sonosCoordinator.avTransportService().GetPositionInfo()
    if (!isTruthyAndNotEmptyString(positionData)) {
      throw new Error(`${NRCSP_ERRORPREFIX} current position data is invalid`)
    }
    return {
      payload: {
        trackData: trackData,
        artist: artist,
        title: title,
        albumArtURL: albumArtURL,
        mediaData: mediaData,
        queueActivated: queueActivated,
        radioId: radioId,
        positionData: positionData
      }
    }
  }

  // ========================================================================
  //
  //             HELPER
  //
  // ========================================================================

  /**  Validates group properties msg.playerName, msg.volume, msg.sameVolume, msg.clearQueue
   * @param  {object}        msg incoming message
   * @param  {string}        [msg.playerName = ''] playerName
   * @param  {string/number} [msg.volume = -1] volume. if not set dont touch orignal volume.
   * @param  {boolean}       [msg.sameVolume = true] sameVolume
   * @param  {boolean}       [msg.clearQueue = true] indicator for clear queue
   * @param  {string}        pkgPrefix package identifier
   *
   * @return {promise} object {playerName, volume, sameVolume, flushQueue}
   * playerName is '' if missing.
   * volume is -1 if missing. Otherwise number, integer in range 1 .. 99
   * sameVolume is true if missing.
   * clearQueue is true if missing.
   *
   * @throws error for all invalid values
   */
  async function validatedGroupProperties (msg, pkgPrefix, excludeVolume) {
    // if missing set to ''.
    const newPlayerName = stringValidRegex(msg, 'playerName', REGEX_ANYCHAR, 'player name', NRCSP_ERRORPREFIX, '')

    // if missing set to -1.
    const newVolume = string2ValidInteger(msg, 'volume', 1, 99, 'volume', NRCSP_ERRORPREFIX, -1)

    // if missing set to true - throws errors if invalid
    let newSameVolume = true
    if (isValidProperty(msg, ['sameVolume'])) {
      if (typeof msg.sameVolume !== 'boolean') {
        throw new Error(`${pkgPrefix}: sameVolume (msg.sameVolume) is not boolean`)
      }
      if (newVolume === -1 && msg.sameVolume === true) {
        throw new Error(`${pkgPrefix}: sameVolume (msg.sameVolume) is true but msg.volume is not specified`)
      }
      newSameVolume = msg.sameVolume
    }

    // if missing set to true - throws errors if invalid
    let clearQueue = true
    if (isValidProperty(msg, ['clearQueue'])) {
      if (typeof msg.flushQueue !== 'boolean') {
        throw new Error(`${pkgPrefix}: clearQueue (msg.cleanQueue) is not boolean`)
      }
      clearQueue = msg.clearQueue
    }

    return { playerName: newPlayerName, volume: newVolume, sameVolume: newSameVolume, clearQueue: clearQueue }
  }

  RED.nodes.registerType('sonos-universal', SonosUniversalNode)
}
