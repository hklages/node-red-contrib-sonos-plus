const SonosHelper = require('./SonosHelper.js');
const helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosControlPlayerNode (config) {
    /**  Create Control Player Node and subscribe to messages
    * @param  {Object} config current node configuration data
    */

    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and subscribe to messages
    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);
    const isValid = helper.validateConfigNodeV3(configNode);
    if (isValid) {
      // clear node status
      node.status({});
      // subscribe and handle input message
      node.on('input', function (msg) {
        node.debug('node on - msg received');
        // check again configNode - in the meantime it might have changed
        const isStillValid = helper.validateConfigNodeV3(configNode);
        if (isStillValid) {
          helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
            if (typeof ipAddress === 'undefined' || ipAddress === null || ipAddress === '') {
              // error handling node status, node error is done in identifyPlayerProcessInputMsg
            } else {
              node.debug('Found sonos player');
              handleInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          node.status({ fill: 'red', shape: 'dot', text: 'error:process message - invalid configNode' });
          node.error('process message - invalid configNode. Please modify!');
        }
      });
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'error:setup subscribe - invalid configNode' });
      node.error('setup subscribe - invalid configNode. Please modify!');
    }
  }

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function handleInputMsg (node, msg, ipaddress) {
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null || sonosPlayer === '') {
      node.status({ fill: 'red', shape: 'dot', text: 'error: get sonosplayer - sonos player is null.' });
      node.error('get sonosplayer - sonos player is null. Details: Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (typeof msg.payload === 'undefined' || msg.payload === null || msg.payload === '') {
      node.status({ fill: 'red', shape: 'dot', text: 'error:validate payload - invalid payload.' });
      node.error('validate payload - invalid payload. Details' + JSON.stringify(msg.payload));
      return;
    }

    let command = String(msg.payload);
    command = command.toLowerCase();
    let commandWithParam = {};

    // dispatch
    const commandList = ['play', 'pause', 'stop', 'toggleplayback', 'mute', 'unmute', 'next_song', 'previous_song', 'join_group', 'leave_group', 'activate_avtransport'];
    if (commandList.indexOf(command) > -1) {
      handleCommandBasic(node, msg, sonosPlayer, command);
    } else if (command === 'play_notification') {
      handlePlayNotification(node, msg, sonosPlayer);
    } else if (command === 'lab_play_notification') {
      node.warn('lab_... is depreciated. Please use play_notification');
      handlePlayNotification(node, msg, sonosPlayer);
      // TODO lab_ function
    } else if (command === 'lab_play_uri') {
      handleLabPlayUri(node, msg, sonosPlayer);
    } else if (command.startsWith('+')) {
      commandWithParam = { cmd: 'volume_increase', parameter: command };
      handleNewVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (command.startsWith('-')) {
      commandWithParam = { cmd: 'volume_decrease', parameter: command };
      handleNewVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (!isNaN(parseInt(command))) {
      commandWithParam = { cmd: 'volume_set', parameter: command };
      handleNewVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning:depatching commands - invalid command' });
      node.warn('depatching commands - invalid command: ' + command);
    }
  }

  // ------------------------------------------------------------------------------------

  /**  Handle basic commands to control sonos player.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @param  {string} cmd command - no parameter
  */
  function handleCommandBasic (node, msg, sonosPlayer, cmd) {
    const sonosFunction = cmd;
    let msgShort;
    switch (cmd) {
      case 'play':
        sonosPlayer.play()
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'stop':
        sonosPlayer.stop()
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'pause':
        sonosPlayer.pause()
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback()
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'mute':
        sonosPlayer.setMuted(true)
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'unmute':
        sonosPlayer.setMuted(false)
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'next_song':
        //  CAUTION! PRERQ: there should be a next song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.next()
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'previous_song':
        //  CAUTION! PRERQ: there should be a previous song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.previous(false)
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'leave_group':
        sonosPlayer.leaveGroup()
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;

      case 'join_group': {
        if (typeof msg.topic === 'undefined' || msg.topic === null || msg.topic === '') {
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} - no valid topic` });
          node.error(`${sonosFunction} - no valid topic`);
          return;
        }
        const deviceToJoing = msg.topic;
        sonosPlayer.joinGroup(deviceToJoing)
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;
      }
      case 'activate_avtransport':
        if (typeof msg.topic === 'undefined' || msg.topic === null || msg.topic === '') {
          msgShort = 'no valid topic';
          node.status({ fill: 'red', shape: 'dot', text: `error:${sonosFunction} -  ${msgShort}` });
          node.error(`${sonosFunction} -  ${msgShort}`);
          return;
        }
        sonosPlayer.setAVTransportURI(msg.topic)
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;
    }
  }

  /**  Send set/adjust volume command to sonos player.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * @param  {Object} commandObject command - cmd and parameter both as string or volume as integer
  * special: volume range 0 .. 100, adjust volume rage -30 ..  +30
  */
  function handleNewVolumeCommand (node, msg, sonosPlayer, commandObject) {
    const volumeValue = parseInt(commandObject.parameter); // convert to integer
    const sonosFunction = commandObject.cmd;
    switch (commandObject.cmd) {
      case 'volume_set':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > 0 && volumeValue < 100) {
            node.debug('is in range:' + volumeValue);
          } else {
            helper.showError(node, new Error('n-r-c-s-p: volume is out of range: ' + volumeValue), sonosFunction, 'out of range');
            return;
          }
        } else {
          helper.showError(node, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue), sonosFunction, 'out of range');
          return;
        }
        sonosPlayer.setVolume(volumeValue)
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;
      case 'volume_decrease':
      case 'volume_increase':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > -30 && volumeValue < 30) {
            node.debug('is in range ' + volumeValue);
          } else {
            helper.showError(node, new Error('n-r-c-s-p: volume is out of range: ' + volumeValue), sonosFunction, 'out of range');
            return;
          }
        } else {
          helper.showError(node, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue), sonosFunction, 'out of range');
          return;
        }
        sonosPlayer.adjustVolume(volumeValue)
          .then(helper.showSuccess(node, sonosFunction))
          .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
        break;
    }
  }

  /**  Play Notification.
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * uses msg.topic (uri) and optional msg.volume (default is 40)
  */
  function handlePlayNotification (node, msg, sonosPlayer) {
    // Check msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null || msg.topic === '') {
      node.status({ fill: 'red', shape: 'dot', text: 'error: invalid topic.' });
      node.error('invalid topic. Details complete payload: ' + JSON.stringify(msg.payload));
      return;
    }
    let notificationVolume;
    const defaultVolume = 40;
    if (typeof msg.volume === 'undefined' || msg.volume === null || msg.volume === '') {
      notificationVolume = defaultVolume; // default
    } else {
      notificationVolume = parseInt(msg.volume);
      if (Number.isInteger(notificationVolume)) {
        if (notificationVolume > 0 && notificationVolume < 100) {
          node.debug('is in range ' + notificationVolume);
        } else {
          node.debug('is not in range: ' + notificationVolume);
          notificationVolume = defaultVolume;
          node.warn('volume value out of range - set to default');
        }
      } else {
        node.debug('is not number');
        notificationVolume = defaultVolume;
        node.warn('invalid volume - corrected to default');
      }
    }
    const uri = String(msg.topic).trim();
    const sonosFunction = 'play notificaton';
    node.debug('notification volume ' + String(notificationVolume));
    sonosPlayer.playNotification(
      {
        uri: uri,
        onlyWhenPlaying: false,
        volume: notificationVolume // Change the volume for the notification, and revert back afterwards.
      })
      .then(helper.showSuccess(node, sonosFunction))
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'))
      .finally(() => node.debug('process id- finally ' + process.pid));
  }

  /**  LAB: For testing only : Play mp3
  * @param  {Object} node current node
  * @param  {Object} msg incoming message
  * @param  {Object} sonosPlayer Sonos Player
  * uses msg.topic
  */
  function handleLabPlayUri (node, msg, sonosPlayer) {
    // Check msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null || msg.topic === '') {
      node.status({ fill: 'red', shape: 'dot', text: 'error: invalid topic.' });
      node.error('validate payload - invalid payload. Details' + JSON.stringify(msg.payload));
      return;
    }
    const uri = String(msg.topic).trim();
    const sonosFunction = 'play uri';
    sonosPlayer.play(uri)
      .then(helper.showSuccess(node, sonosFunction))
      .catch(error => helper.showError(node, error, sonosFunction, 'error caught from response'));
  }
  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
