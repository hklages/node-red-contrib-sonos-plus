var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosControlPlayerNode (config) {
    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and process message
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNode(node, configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message
      node.on('input', function (msg) {
        helper.preprocessInputMsg(node, configNode, msg, function (device) {
          handleInputMsg(node, configNode, msg, device.ipaddress);
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------

  function handleInputMsg (node, configNode, msg, ipaddress) {
    // TODO What about handing over sonosPlayer as parameter?

    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
      return;
    }

    // Convert payload to lowercase string
    var payload = '';
    if (msg.payload !== null && msg.payload !== undefined && msg.payload) {
      payload = '' + msg.payload;// convert to string
    }
    payload = payload.toLowerCase();

    // Handle simple string payload format, rather than specific JSON format previously
    if (payload === 'play' || payload === 'pause' || payload === 'stop' || payload === 'toggleplayback' || payload === 'mute' || payload === 'unmute') {
      handleCommand(node, configNode, msg, sonosPlayer, payload);
    } else if (payload.startsWith('+') && parseInt(payload) > 0 && parseInt(payload) <= 20) {
      payload = { volume_cmd: 'volume_up', volume_value: parseInt(payload) };
      handleVolumeCommand(node, configNode, msg, sonosPlayer, payload);
    } else if (payload.startsWith('-') && parseInt(payload) < 0 && parseInt(payload) >= -20) {
      payload = { volume_cmd: 'volume_down', volume_value: -parseInt(payload) };
      handleVolumeCommand(node, configNode, msg, sonosPlayer, payload);
    } else if (!isNaN(parseInt(payload)) && parseInt(payload) >= 0 && parseInt(payload) <= 100) {
      payload = { volume_cmd: 'volume_set', volume_value: payload };
      handleVolumeCommand(node, configNode, msg, sonosPlayer, payload);
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid msg' + payload });
    }
  }

  // ------------------------------------------------------------------------------------

  function handleCommand (node, configNode, msg, sonosPlayer, cmd) {
    switch (cmd) {
      case 'play':
        sonosPlayer.play().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- play' });
        }).catch(err => {
          node.error('Error play: ' + JSON.stringify(err));
        });
        break;

      case 'stop':
        sonosPlayer.stop().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- stop' });
        }).catch(err => {
          node.error('Error stop: ' + JSON.stringify(err));
        });
        break;

      case 'pause':
        sonosPlayer.pause().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- pause' });
          sonosPlayer.GetPositionInfo().then(result => {
            console.log('xxx %j', result);
          });
        }).catch(err => {
          node.error('Error pause: ' + JSON.stringify(err));
        });
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- toggleplayback' });
        }).catch(err => {
          node.error('Error toggleplayback: ' + JSON.stringify(err));
        });
        break;

      case 'mute':
        sonosPlayer.setMuted(true).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- mute' });
        }).catch(err => {
          node.error('Error mute: ' + JSON.stringify(err));
        });
        break;
      case 'unmute':
        sonosPlayer.setMuted(false).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK- unmute' });
        }).catch(err => {
          node.error('Error unmute: ' + JSON.stringify(err));
        });
        break;
    }
  }

  function handleVolumeCommand (node, configNode, msg, sonosPlayer, payload) {
    var volumeValue = parseInt(payload.volume_value);
    var volumeNew;

    switch (payload.volume_cmd) {
      case 'volume_set':
        if (isNaN(volumeValue) || volumeValue < 0 || volumeValue > 100) {
          node.status({ fill: 'red', shape: 'dot', text: 'invalid value for volume' });
        } else {
          sonosPlayer.setVolume(volumeValue).then(result => {
            node.status({ fill: 'green', shape: 'dot', text: 'OK' });
          }).catch(err => {
            node.error('Error volume_set ' + JSON.stringify(err));
          });
        }
        break;

      case 'volume_up':
        if (isNaN(volumeValue) || volumeValue > 30 || volumeValue <= 0) {
          volumeValue = 8;
        }
        sonosPlayer.getVolume().then(result => {
          volumeNew = parseInt(result) + volumeValue;
          volumeNew = Math.min(100, volumeNew);
          volumeNew = Math.max(0, volumeNew);
          sonosPlayer.setVolume(volumeNew).then(result => {
            node.status({ fill: 'green', shape: 'dot', text: 'OK' });
          }).catch(err => {
            node.status({ fill: 'red', shape: 'dot', text: 'could not set volume' });
            node.error('Error set volume' + JSON.stringify(err));
          });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'could not set volume' });
          node.error(JSON.stringify(err));
        });
        break;

      case 'volume_down':
        if (isNaN(volumeValue) || volumeValue > 30 || volumeValue <= 0) {
          volumeValue = 8;
        }
        sonosPlayer.getVolume().then(result => {
          volumeNew = parseInt(result) - volumeValue;
          volumeNew = Math.min(100, volumeNew);
          volumeNew = Math.max(0, volumeNew);
          sonosPlayer.setVolume(volumeNew).then(result => {
            node.status({ fill: 'green', shape: 'dot', text: 'OK' });
          }).catch(err => {
            node.status({ fill: 'red', shape: 'dot', text: 'could not set volume' });
            node.error('Error set volume' + JSON.stringify(err));
          });
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'could not set volume' });
          node.error(JSON.stringify(err));
        });
        break;
    }
  }

  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
