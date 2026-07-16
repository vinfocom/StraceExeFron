const DISCONNECT_CAUSE_DEFINITIONS = [
  { code: 0, name: "NOT_DISCONNECTED", description: "No disconnect cause was reported.", isNormal: true, isDropped: false, status: "Unknown" },
  { code: 1, name: "INCOMING_MISSED", description: "Incoming call was not answered.", isNormal: false, isDropped: false, status: "Not Connected" },
  { code: 2, name: "NORMAL", description: "Call ended normally by the network or remote party.", isNormal: true, isDropped: false, status: "Connected" },
  { code: 3, name: "LOCAL", description: "Call ended locally by the user or device.", isNormal: true, isDropped: false, status: "User Cancelled" },
  { code: 4, name: "BUSY", description: "Called party was busy.", isNormal: false, isDropped: false, status: "Busy" },
  { code: 5, name: "CONGESTION", description: "Network congestion prevented call completion.", isNormal: false, isDropped: true, status: "Call Setup Failure" },
  { code: 6, name: "MMI", description: "MMI or supplementary-service handling interrupted the call.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 7, name: "INVALID_NUMBER", description: "Dialed number format was invalid.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 8, name: "NUMBER_UNREACHABLE", description: "Destination number could not be reached.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 9, name: "SERVER_UNREACHABLE", description: "Call server or IMS core was unreachable.", isNormal: false, isDropped: true, status: "IMS Failure" },
  { code: 10, name: "INVALID_CREDENTIALS", description: "Authentication failed for the call attempt.", isNormal: false, isDropped: false, status: "IMS Failure" },
  { code: 11, name: "OUT_OF_NETWORK", description: "Device was out of network coverage.", isNormal: false, isDropped: true, status: "Radio Failure" },
  { code: 12, name: "SERVER_ERROR", description: "Network or IMS server returned an error.", isNormal: false, isDropped: true, status: "IMS Failure" },
  { code: 13, name: "TIMED_OUT", description: "Call setup or signaling timed out.", isNormal: false, isDropped: true, status: "Call Setup Failure" },
  { code: 14, name: "LOST_SIGNAL", description: "Radio signal was lost during setup or the call.", isNormal: false, isDropped: true, status: "Radio Failure" },
  { code: 15, name: "LIMIT_EXCEEDED", description: "A network or account limit prevented the call.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 16, name: "INCOMING_REJECTED", description: "Incoming call was actively rejected.", isNormal: false, isDropped: false, status: "Rejected" },
  { code: 17, name: "POWER_OFF", description: "Device radio or power state prevented the call.", isNormal: false, isDropped: true, status: "Radio Failure" },
  { code: 18, name: "OUT_OF_SERVICE", description: "Service was unavailable on the serving cell.", isNormal: false, isDropped: true, status: "Radio Failure" },
  { code: 19, name: "ICC_ERROR", description: "SIM or ICC problem blocked the call.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 20, name: "CALL_BARRED", description: "Outgoing call was barred by policy or provisioning.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 21, name: "FDN_BLOCKED", description: "Fixed dialing number restrictions blocked the call.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 22, name: "CS_RESTRICTED", description: "Circuit-switched service was restricted.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 23, name: "CS_RESTRICTED_NORMAL", description: "Normal circuit-switched calls were restricted.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 24, name: "CS_RESTRICTED_EMERGENCY", description: "Emergency-only circuit-switched restriction was active.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 25, name: "UNOBTAINABLE_NUMBER", description: "Dialed number could not be obtained or routed.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 26, name: "CDMA_LOCKED_UNTIL_POWER_CYCLE", description: "CDMA stack stayed locked until power cycle.", isNormal: false, isDropped: true, status: "Radio Failure" },
  { code: 27, name: "CDMA_DROP", description: "CDMA call dropped unexpectedly.", isNormal: false, isDropped: true, status: "Dropped" },
  { code: 28, name: "CDMA_INTERCEPT", description: "CDMA intercept treatment ended the call.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 29, name: "CDMA_REORDER", description: "CDMA reorder or reroute prevented setup.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 30, name: "CDMA_SO_REJECT", description: "CDMA service option was rejected.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 31, name: "CDMA_RETRY_ORDER", description: "CDMA network requested call retry.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 32, name: "CDMA_ACCESS_FAILURE", description: "CDMA access failure occurred.", isNormal: false, isDropped: true, status: "Radio Failure" },
  { code: 33, name: "CDMA_PREEMPTED", description: "CDMA call was preempted.", isNormal: false, isDropped: true, status: "Dropped" },
  { code: 34, name: "CDMA_NOT_EMERGENCY", description: "Emergency mode restrictions blocked the call.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 35, name: "CDMA_ACCESS_BLOCKED", description: "CDMA access was blocked.", isNormal: false, isDropped: true, status: "Radio Failure" },
  { code: 36, name: "ERROR_UNSPECIFIED", description: "The platform reported an unspecified failure.", isNormal: false, isDropped: true, status: "Unknown" },
  { code: 37, name: "EMERGENCY_ONLY", description: "Only emergency service was available.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 38, name: "NO_PHONE_NUMBER_SUPPLIED", description: "No destination number was supplied.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 39, name: "DIALED_MMI", description: "Dial string was interpreted as MMI/USSD.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 40, name: "VOICEMAIL_NUMBER_MISSING", description: "Voicemail number was missing.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 41, name: "CDMA_CALL_LOST", description: "CDMA call was lost.", isNormal: false, isDropped: true, status: "Dropped" },
  { code: 42, name: "EXITED_ECM", description: "Call ended while exiting emergency callback mode.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 43, name: "OUTGOING_FAILURE", description: "Outgoing call failed before becoming stable.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 44, name: "OUTGOING_CANCELED", description: "Outgoing call was canceled by the user or application.", isNormal: false, isDropped: false, status: "User Cancelled" },
  { code: 45, name: "IMS_MERGED_SUCCESSFULLY", description: "Call was merged into another IMS session.", isNormal: true, isDropped: false, status: "Connected" },
  { code: 46, name: "DIAL_MODIFIED_TO_USSD", description: "Dial string was converted to USSD.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 47, name: "DIAL_MODIFIED_TO_SS", description: "Dial string was converted to supplementary service.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 48, name: "DIAL_MODIFIED_TO_DIAL", description: "Dial string was modified before dialing.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 49, name: "CDMA_ALREADY_ACTIVATED", description: "CDMA provisioning state blocked the request.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 50, name: "VIDEO_CALL_NOT_ALLOWED_WHILE_TTY_ENABLED", description: "TTY mode blocked the requested video call.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 51, name: "CALL_PULLED", description: "Call was pulled to another device.", isNormal: true, isDropped: false, status: "Connected" },
  { code: 52, name: "ANSWERED_ELSEWHERE", description: "Call was answered on another endpoint.", isNormal: true, isDropped: false, status: "Rejected" },
  { code: 53, name: "MAXIMUM_NUMBER_OF_CALLS_REACHED", description: "Maximum simultaneous calls were already active.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 54, name: "DATA_DISABLED", description: "Data was disabled for IMS or PS voice.", isNormal: false, isDropped: false, status: "IMS Failure" },
  { code: 55, name: "DATA_LIMIT_REACHED", description: "A data usage limit blocked the call.", isNormal: false, isDropped: false, status: "IMS Failure" },
  { code: 56, name: "DIALED_ON_WRONG_SLOT", description: "Call was attempted on the wrong SIM slot.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 57, name: "DIALED_CALL_FORWARDING_WHILE_ROAMING", description: "Dialing while roaming triggered call-forwarding restrictions.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 58, name: "CALLBACK_ENABLED", description: "Callback mode or policy blocked direct dialing.", isNormal: false, isDropped: false, status: "Call Setup Failure" },
  { code: 59, name: "IMS_ACCESS_BLOCKED", description: "IMS access was blocked by the network.", isNormal: false, isDropped: true, status: "IMS Failure" },
  { code: 60, name: "IMS_EMERGENCY_REREG", description: "IMS emergency re-registration interrupted the call.", isNormal: false, isDropped: true, status: "IMS Failure" },
];

const DISCONNECT_CAUSE_MAP = new Map(
  DISCONNECT_CAUSE_DEFINITIONS.map((definition) => [definition.code, definition]),
);

const UNKNOWN_CAUSE = {
  code: null,
  name: "UNKNOWN",
  description: "Disconnect cause code was missing or not recognized.",
  isNormal: false,
  isDropped: false,
  status: "Unknown",
};

export function getDisconnectCauseInfo(code) {
  if (typeof code !== "number" || Number.isNaN(code)) {
    return UNKNOWN_CAUSE;
  }

  return DISCONNECT_CAUSE_MAP.get(code) || {
    code,
    name: `UNKNOWN_${code}`,
    description: `Disconnect cause code ${code} is not mapped yet.`,
    isNormal: false,
    isDropped: false,
    status: "Unknown",
  };
}

export function getAllDisconnectCauses() {
  return [...DISCONNECT_CAUSE_DEFINITIONS];
}
