/**
 * Collection of constants being used in several modules.
 *
 * @module GlobalsTs
 * 
 * @author Henning Klages
 * 
 * @since 2021-02-13
*/

'use strict'

module.exports = {

  PACKAGE_PREFIX: 'nrcsp: ',

  TIMEOUT_HTTP_REQUEST: 2000, //in milliseconds
  TIMEOUT_DISCOVERY: 4, //in seconds

  REQUESTED_COUNT_PLAYLISTS: 200,
  REQUESTED_COUNT_QUEUE: 500,
  REQUESTED_COUNT_ML_EXPORT: 1,
  REQUESTED_COUNT_ML_DEFAULT: 1000,

  PLAYER_WITH_TV: ['Sonos Beam', 'Sonos Playbar', 'Sonos Playbase', 'Sonos Arc'],

  REGEX_TIME: /^(([0-1][0-9]):([0-5][0-9]):([0-5][0-9]))$/, // Only hh:mm:ss and hours from 0 to 19
  REGEX_TIME_DELTA: /^([-+]?([0-1][0-9]):([0-5][0-9]):([0-5][0-9]))$/, // Only +/- REGEX_TIME
  REGEX_IP: /^(?:(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(\.(?!$)|$)){4}$/,
  REGEX_HTTP: /^(http|https):\/\/.+$/,
  REGEX_SERIAL: /^([0-9a-fA-F][0-9a-fA-F]-){5}[0-9a-fA-F][0-9a-fA-F]:/, // the end might be improved
  REGEX_RADIO_ID: /^([s][0-9]+)$/,
  REGEX_2DIGITS: /^\d{1,2}$/, // up to 2 digits but at least 1
  REGEX_3DIGITS: /^\d{1,3}$/, // up to 3 digits but at least 1
  REGEX_2DIGITSSIGN: /^[-+]?\d{1,2}$/,
  REGEX_3DIGITSSIGN: /^[-+]?\d{1,3}$/,  
  REGEX_ANYCHAR: /.+/,  // any character but at least 1
  REGEX_QUEUEMODES: /^(NORMAL|REPEAT_ONE|REPEAT_ALL|SHUFFLE|SHUFFLE_NOREPEAT|SHUFFLE_REPEAT_ONE)$/i,
  REGEX_CSV: /^[\p{L}0-9]+([: -._]{0,1}[\p{L}0-9]+)*(,[\p{L}0-9]+([: -._]{0,1}[\p{L}0-9])*)*$/u,

}
