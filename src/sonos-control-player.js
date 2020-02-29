const NrcspHelper = require('./Helper.js');
const NrcspSonos = require('./Sonos-Commands.js');

module.exports = function (RED) {
  'use strict';

  /**  Create Control Player Node and subscribe to messages.
  * @param  {object} config current node configuration data
  */
  function SonosControlPlayerNode (config) {
    RED.nodes.createNode(this, config);
    const sonosFunction = 'setup subscribe';

    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);

    if (!((NrcspHelper.isValidProperty(configNode, ['ipaddress']) && NrcspHelper.REGEX_IP.test(configNode.ipaddress)) ||
      (NrcspHelper.isValidProperty(configNode, ['serialnum']) && NrcspHelper.REGEX_SERIAL.test(configNode.serialnum)))) {
      NrcspHelper.failure(node, null, new Error('n-r-c-s-p: invalid config node - missing ip or serial number'), sonosFunction);
      return;
    }

    // clear node status
    node.status({});
    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received');

      // if ip address exist use it or get it via discovery based on serialNum
      if (NrcspHelper.isValidProperty(configNode, ['ipaddress']) && NrcspHelper.REGEX_IP.test(configNode.ipaddress)) {
        node.debug('using IP address of config node');
        processInputMsg(node, msg, configNode.ipaddress, configNode.serialnum);
      } else {
        // have to get ip address via disovery with serial numbers
        NrcspHelper.warning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (NrcspHelper.isValidProperty(configNode, ['serialnum']) && NrcspHelper.REGEX_SERIAL.test(configNode.serialnum)) {
          NrcspHelper.discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction);
              return;
            }
            if (ipAddress === null) {
              NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction);
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('Found sonos player');
              processInputMsg(node, msg, ipAddress, configNode.serialnum);
            }
          });
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction);
        }
      }
    });
  }

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function processInputMsg (node, msg, ipaddress) {
    const sonosFunction = 'handle input msg';
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);

    if (!NrcspHelper.isTruthyAndNotEmptyString(sonosPlayer)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined sonos player'), sonosFunction);
      return;
    }
    if (!NrcspHelper.isTruthyAndNotEmptyString(sonosPlayer.host) || !NrcspHelper.isTruthyAndNotEmptyString(sonosPlayer.port)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: missing ip or port'), sonosFunction);
      return;
    }
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;

    // Check msg.payload. Store lowercase version in command
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.payload)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction));
      return;
    }

    let command = String(msg.payload);
    command = command.toLowerCase();
    let commandWithParam = {};

    // dispatch
    const groupCommandList = ['play', 'pause', 'stop', 'toggleplayback', 'next_song', 'previous_song'];
    const basicCommandList = ['play_old', 'pause_old', 'stop_old', 'toggleplayback_old', 'mute', 'unmute', 'next_song_old', 'previous_song_old', 'join_group', 'leave_group', 'activate_avtransport'];
    if (basicCommandList.includes(command)) {
      handleCommandBasic(node, msg, sonosPlayer, command);
    } else if (groupCommandList.includes(command)) {
      handleCommandGroup(node, msg, sonosPlayer, command);
    } else if (command === 'play_notification') {
      handlePlayNotification(node, msg, sonosPlayer);
    } else if (command.startsWith('+')) {
      commandWithParam = { cmd: 'volume_increase', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (command.startsWith('-')) {
      commandWithParam = { cmd: 'volume_decrease', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (!isNaN(parseInt(command))) {
      commandWithParam = { cmd: 'volume_set', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (command === 'set_led') {
      handleSetLed(node, msg, sonosPlayer);
    } else if (command === 'set_crossfade') {
      setCrossfadeMode(node, msg, sonosPlayer);
    } else if (command === 'set_loudness') {
      setLoudness(node, msg, sonosPlayer);
    } else if (command === 'set_eq') {
      setEQ(node, msg, sonosPlayer);
    } else if (command === 'set_sleeptimer') {
      configureSleepTimer(node, msg, sonosPlayer);
    } else if (command === 'create_stereopair') {
      createStereoPair(node, msg, sonosPlayer);
    } else if (command === 'separate_stereopair') {
      separateStereoPair(node, msg, sonosPlayer);
    } else if (command === 'lab_test') {
      labTest(node, msg, sonosPlayer);
    } else {
      NrcspHelper.warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(commandWithParam));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Handle basic commands to control sonos player.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *                 volume valid volume
  * @param  {object} sonosPlayer Sonos Player
  * @param  {string} cmd command - no parameter
  * @output {object} msg unmodified / stopped in case of error
  */
  function handleCommandBasic (node, msg, sonosPlayer, cmd) {
    const sonosFunction = cmd;
    const originalCmd = cmd.replace('_old', '');
    switch (originalCmd) {
      case 'play':
        sonosPlayer.play()
          .then(() => { // optionally change volume
            if (NrcspHelper.isTruthyAndNotEmptyString(msg.volume)) {
              const newVolume = parseInt(msg.volume);
              if (Number.isInteger(newVolume)) {
                if (newVolume > 0 && newVolume < 100) {
                  // play and change volume
                  node.debug('msg.volume is in range 1...99: ' + newVolume);
                  return sonosPlayer.setVolume(msg.volume);
                } else {
                  node.debug('msg.volume is not in range: ' + newVolume);
                  throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
                }
              } else {
                node.debug('msg.volume is not number');
                throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
              }
            } else {
              return true; // dont touch volume
            }
          })
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'stop':
        sonosPlayer.stop()
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'pause':
        sonosPlayer.pause()
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback()
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'mute':
        sonosPlayer.setMuted(true)
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'unmute':
        sonosPlayer.setMuted(false)
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'next_song':
        //  CAUTION! PRERQ: there should be a next song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.next()
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'previous_song':
        //  CAUTION! PRERQ: there should be a previous song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.previous()
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'leave_group':
        sonosPlayer.leaveGroup()
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'join_group': {
        if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
          return;
        }

        const deviceToJoing = msg.topic;
        sonosPlayer.joinGroup(deviceToJoing)
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
      }
      case 'activate_avtransport':
        // validate msg.topic
        if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
          return;
        }

        sonosPlayer.setAVTransportURI(msg.topic)
          .then(() => { // optionally change volume
            if (NrcspHelper.isTruthyAndNotEmptyString(msg.volume)) {
              const newVolume = parseInt(msg.volume);
              if (Number.isInteger(newVolume)) {
                if (newVolume > 0 && newVolume < 100) {
                  // play and change volume
                  node.debug('msg.volume is in range 1...99: ' + newVolume);
                  return sonosPlayer.setVolume(msg.volume);
                } else {
                  node.debug('msg.volume is not in range: ' + newVolume);
                  throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
                }
              } else {
                node.debug('msg.volume is not number');
                throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
              }
            } else {
              return true; // dont touch volume
            }
          })
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
    }
  }

  /**  Handle group commands to control sonos player - error when client
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *                 volume valid volume
  * @param  {object} sonosPlayer Sonos Player
  * @param  {string} cmd command - no parameter
  * @output {object} msg unmodified / stopped in case of error
  */
  function handleCommandGroup (node, msg, sonosPlayer, cmd) {
    const sonosFunction = cmd;

    switch (cmd) {
      case 'play':
        sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
          .then((zoneData) => {
            if (!NrcspHelper.isTruthyAndNotEmptyString(zoneData)) {
              throw new Error('n-r-c-s-p: undefined zone group attributes received');
            }
            if (!NrcspHelper.isTruthy(zoneData.CurrentZoneGroupName)) {
              throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received');
            }
            if (zoneData.CurrentZoneGroupName === '') {
              throw new Error(('n-r-c-s-p: player is in client mode - command rejected'));
            }
            return true;
          })
          .then(() => { return sonosPlayer.play(); })
          .then(() => { // optionally change volume
            if (NrcspHelper.isTruthyAndNotEmptyString(msg.volume)) {
              const newVolume = parseInt(msg.volume);
              if (Number.isInteger(newVolume)) {
                if (newVolume > 0 && newVolume < 100) {
                  // play and change volume
                  node.debug('msg.volume is in range 1...99: ' + newVolume);
                  return sonosPlayer.setVolume(msg.volume);
                } else {
                  node.debug('msg.volume is not in range: ' + newVolume);
                  throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
                }
              } else {
                node.debug('msg.volume is not number');
                throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
              }
            } else {
              return true; // dont touch volume
            }
          })
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'stop':
        sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
          .then((zoneData) => {
            if (!NrcspHelper.isTruthyAndNotEmptyString(zoneData)) {
              throw new Error('n-r-c-s-p: undefined zone group attributes received');
            }
            if (!NrcspHelper.isTruthy(zoneData.CurrentZoneGroupName)) {
              throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received');
            }
            if (zoneData.CurrentZoneGroupName === '') {
              throw new Error(('n-r-c-s-p: player is in client mode - command rejected'));
            }
            return true;
          })
          .then(() => { return sonosPlayer.stop(); })
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'pause':
        sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
          .then((zoneData) => {
            if (!NrcspHelper.isTruthyAndNotEmptyString(zoneData)) {
              throw new Error('n-r-c-s-p: undefined zone group attributes received');
            }
            if (!NrcspHelper.isTruthy(zoneData.CurrentZoneGroupName)) {
              throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received');
            }
            if (zoneData.CurrentZoneGroupName === '') {
              throw new Error(('n-r-c-s-p: player is in client mode - command rejected'));
            }
            return true;
          })
          .then(() => { return sonosPlayer.pause(); })
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'toggleplayback':
        sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
          .then((zoneData) => {
            if (!NrcspHelper.isTruthyAndNotEmptyString(zoneData)) {
              throw new Error('n-r-c-s-p: undefined zone group attributes received');
            }
            if (!NrcspHelper.isTruthy(zoneData.CurrentZoneGroupName)) {
              throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received');
            }
            if (zoneData.CurrentZoneGroupName === '') {
              throw new Error(('n-r-c-s-p: player is in client mode - command rejected'));
            }
            return true;
          })
          .then(() => { return sonosPlayer.togglePlayback(); })
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'next_song':
        //  CAUTION! PRERQ: there should be a next song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
          .then((zoneData) => {
            if (!NrcspHelper.isTruthyAndNotEmptyString(zoneData)) {
              throw new Error('n-r-c-s-p: undefined zone group attributes received');
            }
            if (!NrcspHelper.isTruthy(zoneData.CurrentZoneGroupName)) {
              throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received');
            }
            if (zoneData.CurrentZoneGroupName === '') {
              throw new Error(('n-r-c-s-p: player is in client mode - command rejected'));
            }
            return true;
          })
          .then(() => { return sonosPlayer.next(); })
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'previous_song':
        //  CAUTION! PRERQ: there should be a previous song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
          .then((zoneData) => {
            if (!NrcspHelper.isTruthyAndNotEmptyString(zoneData)) {
              throw new Error('n-r-c-s-p: undefined zone group attributes received');
            }
            if (!NrcspHelper.isTruthy(zoneData.CurrentZoneGroupName)) {
              throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received');
            }
            if (zoneData.CurrentZoneGroupName === '') {
              throw new Error(('n-r-c-s-p: player is in client mode - command rejected'));
            }
            return true;
          })
          .then(() => { return sonosPlayer.previous(); })
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
    }
  }
  /**  Send set/adjust volume command to sonos player.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * @param  {object} commandObject command - cmd and parameter both as string or volume as integer
  * @output {object} msg unmodified / stopped in case of error
  * special: volume range 1.. 99, adjust volume rage -29 ..  +29
  */
  function handleVolumeCommand (node, msg, sonosPlayer, commandObject) {
    const sonosFunction = commandObject.cmd;
    const volumeValue = parseInt(commandObject.parameter); // convert to integer
    switch (commandObject.cmd) {
      case 'volume_set':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > 0 && volumeValue < 100) {
            node.debug('is in range:' + volumeValue);
          } else {
            NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is out of range: ' + String(volumeValue)));
            return;
          }
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue));
          return;
        }
        sonosPlayer.setVolume(volumeValue)
          .then(NrcspHelper.success(node, msg, sonosFunction))
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
      case 'volume_decrease':
      case 'volume_increase':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > -30 && volumeValue < 30) {
            node.debug('is in range ' + volumeValue);
          } else {
            NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is out of range: ' + String(volumeValue)));
            return;
          }
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue));
          return;
        }
        sonosPlayer.adjustVolume(volumeValue)
          .then(() => {
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
    }
  }

  /**  Play Notification.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *                 topic valid topic lab_play_uri
  *                 volume valide volume to set
  * @param  {object} sonosPlayer Sonos Player
  * @output {object} msg unmodified / stopped in case of error
  * uses msg.topic (uri) and optional msg.volume (default is 40)
  */
  function handlePlayNotification (node, msg, sonosPlayer) {
    const sonosFunction = 'play notification';
    // validate msg.topic.
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
      return;
    }
    // validate msg.volume - use default as backup
    let notificationVolume;
    const defaultVolume = 40;
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.volume)) {
      notificationVolume = defaultVolume; // default
    } else {
      notificationVolume = parseInt(msg.volume);
      if (Number.isInteger(notificationVolume)) {
        if (notificationVolume > 0 && notificationVolume < 100) {
          node.debug('is in range ' + notificationVolume);
        } else {
          node.debug('is not in range: ' + notificationVolume);
          notificationVolume = defaultVolume;
          NrcspHelper.warning(node, sonosFunction, 'volume value out of range - set to default', 'value-> ' + JSON.stringify(notificationVolume));
        }
      } else {
        node.debug('is not number');
        notificationVolume = defaultVolume;
        NrcspHelper.warning(node, sonosFunction, 'invalid volume - set to default', 'value-> ' + JSON.stringify(notificationVolume));
      }
    }
    const uri = String(msg.topic).trim();
    node.debug('notification volume ' + String(notificationVolume));
    sonosPlayer.playNotification(
      {
        uri: uri,
        onlyWhenPlaying: false,
        volume: notificationVolume // Change the volume for the notification, and revert back afterwards.
      })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction))
      .finally(() => node.debug('process id- finally ' + process.pid));
  }

  /**  Set LED On or Off.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *             topic: On | Off
  * @param  {object} sonosPlayer Sonos Player
  * @output {object} msg unmodified / stopped in case of error
  */
  function handleSetLed (node, msg, sonosPlayer) {
    const sonosFunction = 'set LED';
    // validate msg.topic.
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }

    sonosPlayer.setLEDState(msg.topic)
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Set crossfade mode.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic On or Off
  * @param  {object} sonosPlayer Sonos Player
  * @output: {object} msg unmodified / stopped in case of error
  */
  function setCrossfadeMode (node, msg, sonosPlayer) {
    const sonosFunction = 'set crossfade mode';

    // validate msg.topic
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }
    const newValue = (msg.topic === 'On' ? 1 : 0);

    // execute command
    NrcspSonos.setCmd(sonosPlayer.baseUrl, 'SetCrossfadeMode', { CrossfadeMode: newValue })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Set loudness.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic On or Off
  * @param  {object} sonosPlayer Sonos Player
  * @output: {object} msg unmodified / stopped in case of error
  */
  function setLoudness (node, msg, sonosPlayer) {
    const sonosFunction = 'set loudness';

    // validate msg.topic
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
      return;
    }

    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }
    const newValue = (msg.topic === 'On' ? 1 : 0);

    // execute command
    NrcspSonos.setCmd(sonosPlayer.baseUrl, 'SetLoudness', { DesiredLoudness: newValue })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Set EQ (for specified EQTypes eg NightMode, DialogLevel (aka Speech Enhancement) and SubGain (aka sub Level)) for player with TV.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic specifies EQtype
  * @param  {string} msg.eqvalue value On,Off or value -15 .. 15
  * @param  {object} sonosPlayer sonos player object
  * @output: {object} msg unmodified / stopped in case of error
  */
  function setEQ (node, msg, sonosPlayer) {
    const sonosFunction = 'set EQ';

    // validate msg.topic
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
      return;
    }

    if (!NrcspSonos.ACTIONS_TEMPLATES.SetEQ.eqTypeValues.includes(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: invalid topic. Should be one of ' + NrcspSonos.ACTIONS_TEMPLATES.SetEQ.eqTypeValues.toString()), sonosFunction);
      return;
    }
    const eqType = msg.topic;

    // validate msg.value
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.eqvalue)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined new value'), sonosFunction);
      return;
    }
    let newValue;
    if (eqType === 'SubGain') {
      // validate integer in range -15 to 15
      if (Number.isInteger(msg.eqvalue)) {
        if (msg.eqvalue < -15 || msg.eqvalue > 15) {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.eqvalue must be in range -15 to +15'), sonosFunction);
          return;
        }
        newValue = msg.eqvalue;
      } else {
        NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.eqvalue must be of type integer'), sonosFunction);
        return;
      }
    } else if (eqType === 'NightMode' || eqType === 'DialogLevel') {
      // validate: On/Off
      if (!(msg.eqvalue === 'On' || msg.eqvalue === 'Off')) {
        NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
        return;
      }
      newValue = (msg.eqvalue === 'On' ? 1 : 0);
    } else {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: EQType in msg.topic is not yet supported'), sonosFunction);
      return;
    }

    sonosPlayer.deviceDescription()
      .then((response) => { // ensure that SONOS player has TV mode
        if (!NrcspHelper.isValidPropertyNotEmptyString(response, ['modelName'])) {
          throw new Error('n-r-c-s-p: undefined model name received');
        }
        if (!NrcspHelper.PLAYER_WITH_TV.includes(response.modelName)) {
          throw new Error('n-r-c-s-p: your player does not support TV');
        }
        return true;
      })
      .then(() => { // sonos command
        const args = { EQType: eqType, DesiredValue: newValue };
        return NrcspSonos.setCmd(sonosPlayer.baseUrl, 'SetEQ', args);
      })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Configure/Set the sleep timer.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic format hh:mm:ss hh < 20
  * @param  {object} sonosPlayer Sonos Player
  * @output: {object} msg unmodified / stopped in case of error
  */
  function configureSleepTimer (node, msg, sonosPlayer) {
    const sonosFunction = 'set/configure sleep timer';

    // validate msg.topic
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
      return;
    }

    if (!NrcspHelper.REGEX_TIME.test(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.topic must have format hh:mm:ss, hh < 20'), sonosFunction);
      return;
    }
    const newValue = msg.topic;

    // execute command
    NrcspSonos.setCmd(sonosPlayer.baseUrl, 'ConfigureSleepTimer', { NewSleepTimerDuration: newValue })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Create a stereo pair.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic uuid of right hand speaker
  * @param  {object} sonosPlayer Sonos Player
  * @output: {object} msg unmodified / stopped in case of error
  */
  function createStereoPair (node, msg, sonosPlayer) {
    const sonosFunction = 'create stereo pair';

    // validate msg.topic
    if (!NrcspHelper.isTruthyAndNotEmptyString(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined msg.topic', sonosFunction));
      return;
    }
    sonosPlayer.deviceDescription()
      .then((response) => {
        if (!NrcspHelper.isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player properties received');
        }
        return response.UDN.substring('uuid:'.length);
      })
      .then((uuid) => {
        const value = `${uuid}:LF,LF;${msg.topic}:RF,RF`;
        return NrcspSonos.setCmd(sonosPlayer.baseUrl, 'CreateStereoPair', { ChannelMapSet: value });
      })
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Separate a stereo pair.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * @output: {object} msg unmodified / stopped in case of error
  */
  function separateStereoPair (node, msg, sonosPlayer) {
    const sonosFunction = 'separate stereo pair';

    // validate msg.topic
    NrcspSonos.setCmd(sonosPlayer.baseUrl, 'SeparateStereoPair', {})
      .then(() => {
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  LAB: Test new features, error messsages, ...
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  */
  function labTest (node, msg, sonosPlayer) {
  }

  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
