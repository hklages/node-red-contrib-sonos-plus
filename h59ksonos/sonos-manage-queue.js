var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosManageQueueNode (config) {
    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and process message
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNode(node, configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // Get data from Node dialog
      node.songuri = config.songuri;
      node.position = config.position;
      if (node.position === 'empty') {
        node.position = '';
      }
      node.positioninqueue = config.positioninqueue;

      // handle input message
      node.on('input', function (msg) {
        helper.preprocessInputMsg(node, configNode, msg, function (device) {
          handleInputMsg(node, configNode, msg, device.ipaddress);
        });
      });
    }
  }

  // -------------------------------------------------------------------------

  function handleInputMsg (node, configNode, msg, ipaddress) {
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
      node.error('sonos player is null');
      return;
    }

    // Check msg.payload and convert to lowercase string
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'wrong payload' });
      node.error('invalid payload!');
      return;
    }
    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();

    // dispatch
    if (command === 'activate_queue') {
      activateQueue(node, sonosPlayer);
    } else if (command === 'play_next') {
      playNext(node, sonosPlayer);
    } else if (command === 'play_previous') {
      playPrevious(node, sonosPlayer);
    } else if (command === 'play_track') {
      selectTrack(node, sonosPlayer);
    } else if (command === 'flush_queue') {
      sonosPlayer.flush().then(result => {
        node.status({ fill: 'green', shape: 'dot', text: 'OK- flush' });
      }).catch(err => {
        node.status({ fill: 'red', shape: 'dot', text: 'Error- flush' });
        node.error('Error flush queue: ' + JSON.stringify(err));
      });
    } else {
      // TODO error handling
      node.status({ fill: 'red', shape: 'dot', text: 'invalid command!' });
      node.warn('invalid command: ' + command);
    }
  }

  function activateQueue (node, sonosPlayer) {
    // TODO ensure not empty
    sonosPlayer.selectQueue().then(result => {
      node.status({ fill: 'green', shape: 'dot', text: 'OK- play' });
    }).catch(err => {
      node.error('Error activateQueue: ' + JSON.stringify(err));
    });
  }

  function playNext (node, sonosPlayer) {
    // TODO Ensure there is next and queue not empty
    sonosPlayer.next().then(result => {
      node.status({ fill: 'green', shape: 'dot', text: 'OK- play' });
    }).catch(err => {
      node.error('Error play next: ' + JSON.stringify(err));
    });
  }

  function playPrevious (node, sonosPlayer) {
    // TODO Ensure there is next and queue not empty
    sonosPlayer.previous().then(result => {
      node.status({ fill: 'green', shape: 'dot', text: 'OK- play' });
    }).catch(err => {
      node.error('Error play previous: ' + JSON.stringify(err));
    });
  }

  function selectTrack (node, sonosPlayer) {
    // TODO Ensure there is next and queue not empty

    sonosPlayer.selectTrack(4).then(result => {
      node.status({ fill: 'green', shape: 'dot', text: 'OK- play' });
    }).catch(err => {
      node.error('Error play track: ' + JSON.stringify(err));
    });
  }
  RED.nodes.registerType('sonos-manage-queue', SonosManageQueueNode);
};
