/**
 * Collection of constants being used in several modules.
 *
 * @module GlobalsTs
 * 
 * @author Henning Klages
 * 
*/

'use strict'

module.exports = {

  PACKAGE_PREFIX: 'nrcsp:',

  TIMEOUT_HTTP_REQUEST: 4000, //in milliseconds
  TIMEOUT_DISCOVERY: 4, //in seconds

  ML_REQUESTS_MAXIMUM: 10, // Music library: maximum number of http requests submitted
  ML_REQUESTED_COUNT: 1000,  // Music library: Should always be 1000, the allowed maximum
  QUEUE_REQUESTS_MAXIMUM: 10, // SONOS Queue: maximum number of http requests submitted
  QUEUE_REQUESTED_COUNT: 1000,  // SONOS Queue: Should always be 1000, the allowed maximum
  REQUESTED_COUNT_MYSONOS_DEFAULT: 200,
  REQUESTED_COUNT_MYSONOS_EXPORT: 200, // because no filter
  VALIDATION_INTEGER_MAXIMUM: 9999, // because of validToInteger, REGEX_4DIGITSSIGN
  VALIDATION_INTEGER_MINIMUM: -9999, // because of validToInteger, REGEX_4DIGITSSIGN

  REGEX_TIME: /^(([0-1][0-9]):([0-5][0-9]):([0-5][0-9]))$/, // Only hh:mm:ss and hours from 0 to 19
  REGEX_TIME_DELTA: /^([-+]?([0-1][0-9]):([0-5][0-9]):([0-5][0-9]))$/, // Only +/- REGEX_TIME
  REGEX_IP: /^(?:(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(\.(?!$)|$)){4}$/,

  //https://www.geeksforgeeks.org/how-to-validate-a-domain-name-using-regular-expression/
  // The domain name should be a-z or A-Z or 0-9 and hyphen (-).
  // The domain name should be between 1 and 63 characters long.
  // The domain name should not start or end with a hyphen(-) (e.g. -ibm.com or ibm.com-).
  // The last TLD (Top level domain) must be at least two characters and a maximum of 6 characters.
  // The domain name can be a subdomain (e.g. contribute.geeksforgeeks.org).
  // -- modification: replaced \\ by \ and added i instead of capital letters
  REGEX_DNS: /^((?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,6}$/i,

  REGEX_HTTP: /^(http|https):\/\/.+$/,
  REGEX_SERIAL: /^([0-9a-fA-F][0-9a-fA-F]-){5}[0-9a-fA-F][0-9a-fA-F]:/, // the end might be improved
  REGEX_RADIO_ID: /^([s][0-9]+)$/,
  REGEX_2DIGITS: /^\d{1,2}$/, // up to 2 digits but at least 1
  REGEX_3DIGITS: /^\d{1,3}$/, // up to 3 digits but at least 1
  REGEX_2DIGITSSIGN: /^[-+]?\d{1,2}$/,
  REGEX_3DIGITSSIGN: /^[-+]?\d{1,3}$/,
  REGEX_4DIGITSSIGN: /^[-+]?\d{1,4}$/,
  REGEX_ANYCHAR: /.+/,  // any character but at least 1

  REGEX_ANYCHAR_BLANK: /.*/, //any character or blank
  REGEX_QUEUEMODES: /^(NORMAL|REPEAT_ONE|REPEAT_ALL|SHUFFLE|SHUFFLE_NOREPEAT|SHUFFLE_REPEAT_ONE)$/i,
  REGEX_CSV: /^[\p{L}0-9]+([: -._]{0,1}[\p{L}0-9]+)*(,[\p{L}0-9]+([: -._]{0,1}[\p{L}0-9])*)*$/u,

}
