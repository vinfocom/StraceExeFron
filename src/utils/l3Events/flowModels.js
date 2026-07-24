const MODEL_MATCH_THRESHOLD = 2;

function step(label, from, to, test) {
  return { label, from, to, test };
}

export const NETWORK_FLOW_MODELS = [
  {
    id: "gsm-mo-call",
    name: "GSM MO Call",
    technology: "GSM",
    access: "2G",
    objective: "CS voice accessibility and setup",
    nodes: ["UE", "BTS/BSC", "MSC"],
    kpis: ["CSSR", "Accessibility", "DCR"],
    observation: "Failures before Connect impact CSSR.",
    match: /\bgsm\b|\bbts\b|\bbsc\b|channel\W*request|immediate\W*assignment|cm\W*service\W*request|cipher\W*mode|call\W*proceeding/i,
    steps: [
      step("Channel Request", "UE", "BTS/BSC", /channel\W*request/i),
      step("Immediate Assignment", "BTS/BSC", "UE", /immediate\W*assignment/i),
      step("CM Service Request", "UE", "MSC", /cm\W*service\W*request/i),
      step("Authentication", "MSC", "UE", /authentication\W*(request|response)?/i),
      step("Cipher Mode", "MSC", "UE", /cipher\W*mode\W*(command|complete)?/i),
      step("SETUP", "UE", "MSC", /\bsetup\b/i),
      step("Call Proceeding", "MSC", "UE", /call\W*proceeding/i),
      step("Alerting", "MSC", "UE", /\balerting\b/i),
      step("Connect", "MSC", "UE", /\bconnect\b/i),
      step("Disconnect", "UE", "MSC", /\bdisconnect\b/i),
      step("Release", "MSC", "UE", /\brelease(\W*complete)?\b/i),
    ],
  },
  {
    id: "umts-cs-mo-call",
    name: "UMTS CS MO Call",
    technology: "UMTS",
    access: "3G",
    objective: "CS voice setup over UTRAN",
    nodes: ["UE", "NodeB/RNC", "MSC"],
    kpis: ["CSSR", "RRC Setup Success", "DCR"],
    observation: "RRC setup and RAB assignment failures block CS call setup.",
    match: /\bumts\b|\butran\b|\bnodeb\b|\brnc\b|rab\W*assignment|rrc\W*connection\W*setup/i,
    steps: [
      step("RRC Connection Request", "UE", "NodeB/RNC", /rrc\W*connection\W*request/i),
      step("RRC Connection Setup", "NodeB/RNC", "UE", /rrc\W*connection\W*setup(?!\W*complete)/i),
      step("RRC Setup Complete", "UE", "NodeB/RNC", /rrc\W*connection\W*setup\W*complete/i),
      step("CM Service Request", "UE", "MSC", /cm\W*service\W*request/i),
      step("Authentication", "MSC", "UE", /authentication\W*(request|response)?/i),
      step("Security Mode", "MSC", "UE", /security\W*mode|cipher\W*mode/i),
      step("RAB Assignment", "MSC", "NodeB/RNC", /rab\W*assignment/i),
      step("SETUP", "UE", "MSC", /\bsetup\b/i),
      step("Alerting", "MSC", "UE", /\balerting\b/i),
      step("Connect", "MSC", "UE", /\bconnect\b/i),
      step("Release", "MSC", "UE", /\brelease\b/i),
    ],
  },
  {
    id: "lte-initial-attach",
    name: "LTE Initial Attach",
    technology: "LTE",
    access: "4G",
    objective: "UE registration with EPC",
    nodes: ["UE", "eNodeB", "MME", "SGW/PGW"],
    kpis: ["Accessibility", "Attach Success", "EPS Bearer Success"],
    observation: "Successful attach confirms UE registration with EPC.",
    match: /\blte\b|attach\W*request|attach\W*accept|eps\W*bearer|rrc\W*connection\W*setup|mib|sib/i,
    steps: [
      step("Cell Selection", "UE", "eNodeB", /cell\W*selection/i),
      step("MIB/SIB", "eNodeB", "UE", /master\W*information|system\W*information|\bmib\b|\bsib\b/i),
      step("RRC Connection Request", "UE", "eNodeB", /rrc\W*connection\W*request/i),
      step("RRC Connection Setup", "eNodeB", "UE", /rrc\W*connection\W*setup(?!\W*complete)/i),
      step("RRC Setup Complete", "UE", "eNodeB", /rrc\W*connection\W*setup\W*complete/i),
      step("Attach Request", "UE", "MME", /attach\W*request/i),
      step("Authentication", "MME", "UE", /authentication\W*(request|response)?/i),
      step("Security Mode", "MME", "UE", /security\W*mode/i),
      step("Attach Accept", "MME", "UE", /attach\W*accept/i),
      step("Attach Complete", "UE", "MME", /attach\W*complete/i),
      step("Default EPS Bearer", "MME", "SGW/PGW", /default\W*eps\W*bearer|data\W*call\W*setup|bearer/i),
      step("RRC Reconfiguration Complete", "UE", "eNodeB", /rrc\W*connection\W*reconfiguration\W*complete/i),
    ],
  },
  {
    id: "lte-volte-mo-call",
    name: "LTE VoLTE MO Call",
    technology: "LTE IMS",
    access: "4G",
    objective: "Mobile originated VoLTE call setup",
    nodes: ["UE", "eNodeB", "MME", "IMS"],
    kpis: ["VoLTE CSSR", "MOS", "RTP Continuity"],
    observation: "Voice is carried over LTE using IMS.",
    match: /volte|ims\W*registration|sip\W*invite|100\W*trying|183|prack|rtp|dedicated\W*eps\W*bearer|call\W*dial|ims\W*dial/i,
    steps: [
      step("IMS Registration", "UE", "IMS", /ims\W*registration|sip\W*register|ims\W*registered/i),
      step("Service Request", "UE", "MME", /service\W*request/i),
      step("Dedicated EPS Bearer", "MME", "IMS", /dedicated\W*eps\W*bearer|qci|bearer/i),
      step("SIP INVITE", "UE", "IMS", /sip\W*invite|\binvite\b|call\W*dial|ims\W*dial/i),
      step("100 Trying", "IMS", "UE", /100\W*trying/i),
      step("183 Session Progress", "IMS", "UE", /183|session\W*progress/i),
      step("PRACK", "UE", "IMS", /\bprack\b/i),
      step("180 Ringing", "IMS", "UE", /180\W*ringing|\bring(?:ing)?\b/i),
      step("200 OK", "IMS", "UE", /200\W*ok/i),
      step("ACK", "UE", "IMS", /\back\b/i),
      step("RTP Voice", "UE", "IMS", /\brtp\b|voice\W*traffic/i),
      step("BYE", "UE", "IMS", /\bbye\b|disconnect/i),
    ],
  },
  {
    id: "lte-volte-mt-call",
    name: "LTE VoLTE MT Call",
    technology: "LTE IMS",
    access: "4G",
    objective: "Mobile terminated VoLTE call setup",
    nodes: ["UE", "eNodeB", "MME", "IMS"],
    kpis: ["Paging Success", "CSSR", "MOS"],
    observation: "Paging and RRC resume/connectivity drive MT call accessibility.",
    match: /paging|incoming|mobile\W*terminated|mt\W*call|180\W*ringing|sip\W*invite/i,
    steps: [
      step("Paging", "eNodeB", "UE", /\bpaging\b/i),
      step("RRC Connection", "UE", "eNodeB", /rrc\W*connection/i),
      step("Service Request", "UE", "MME", /service\W*request/i),
      step("Dedicated Bearer", "MME", "IMS", /dedicated\W*bearer|qci|bearer/i),
      step("SIP INVITE", "IMS", "UE", /sip\W*invite|\binvite\b|incoming|mt\W*call/i),
      step("180 Ringing", "UE", "IMS", /180\W*ringing|\bring(?:ing)?\b|alerting/i),
      step("200 OK", "UE", "IMS", /200\W*ok|call\W*active/i),
      step("ACK", "IMS", "UE", /\back\b/i),
      step("RTP Voice", "UE", "IMS", /\brtp\b|voice\W*traffic/i),
      step("BYE", "UE", "IMS", /\bbye\b|disconnect/i),
    ],
  },
  {
    id: "lte-handover",
    name: "LTE X2/S1 Handover",
    technology: "LTE",
    access: "4G",
    objective: "Connected-mode mobility",
    nodes: ["UE", "Source eNodeB", "Target eNodeB", "MME/SGW"],
    kpis: ["HOSR", "Mobility Success", "RLF"],
    observation: "Measurement, HO command, random access and path switch identify the mobility break point.",
    match: /handover|measurement\W*report|ho\W*command|path\W*switch|ue\W*context\W*release|random\W*access/i,
    steps: [
      step("Measurement Report", "UE", "Source eNodeB", /measurement\W*report|meas\W*report/i),
      step("Handover Request", "Source eNodeB", "Target eNodeB", /handover\W*request/i),
      step("Handover Request Ack", "Target eNodeB", "Source eNodeB", /handover\W*request\W*ack/i),
      step("RRC Reconfiguration HO Command", "Source eNodeB", "UE", /rrc\W*connection\W*reconfiguration|ho\W*command/i),
      step("Random Access", "UE", "Target eNodeB", /random\W*access|rach/i),
      step("RRC Reconfiguration Complete", "UE", "Target eNodeB", /rrc\W*connection\W*reconfiguration\W*complete/i),
      step("Path Switch", "Target eNodeB", "MME/SGW", /path\W*switch/i),
      step("UE Context Release", "Source eNodeB", "MME/SGW", /ue\W*context\W*release/i),
    ],
  },
  {
    id: "lte-nsa-endc",
    name: "LTE-NSA EN-DC",
    technology: "LTE-NR NSA",
    access: "5G NSA",
    objective: "NR secondary node addition and release",
    nodes: ["UE", "eNodeB", "gNB"],
    kpis: ["EN-DC Success", "5G Availability"],
    observation: "B1/B2 measurements and SCG reconfiguration reveal EN-DC activation health.",
    match: /endc|en-dc|secondary\W*node|scg|pscell|b1|b2|nr\W*nsa/i,
    steps: [
      step("LTE Connected", "UE", "eNodeB", /lte\W*connected|rrc\W*connected/i),
      step("Measurement Report B1/B2", "UE", "eNodeB", /measurement\W*report|meas\W*report|event\W*b[12]|\bb[12]\b/i),
      step("Secondary Node Addition Request", "eNodeB", "gNB", /secondary\W*node\W*addition\W*request|sn\W*addition\W*request/i),
      step("Secondary Node Addition Ack", "gNB", "eNodeB", /secondary\W*node\W*addition\W*(request\W*)?ack|sn\W*addition\W*ack/i),
      step("RRC Reconfiguration SCG Add", "eNodeB", "UE", /rrc\W*connection\W*reconfiguration|scg\W*add/i),
      step("RRC Reconfiguration Complete", "UE", "eNodeB", /rrc\W*connection\W*reconfiguration\W*complete/i),
      step("EN-DC Active", "UE", "gNB", /endc\W*active|en-dc\W*active|nr\W*available/i),
      step("SCG Modification/Release", "eNodeB", "UE", /scg\W*(modification|release)|secondary\W*cell\W*release/i),
    ],
  },
  {
    id: "nsa-voice-data",
    name: "5G NSA Voice and Data",
    technology: "LTE-NR NSA IMS",
    access: "5G NSA",
    objective: "VoLTE voice with NR data split",
    nodes: ["UE", "eNodeB", "gNB", "IMS"],
    kpis: ["5G Availability", "Throughput", "VoLTE CSSR"],
    observation: "Voice remains on LTE anchor while user data uses NR.",
    match: /endc\W*active|nr\W*nsa|rtp|ims\W*registration|sip\W*invite|throughput|user\W*data/i,
    steps: [
      step("EN-DC Active", "UE", "gNB", /endc\W*active|en-dc\W*active|nr\W*available/i),
      step("IMS Registration", "UE", "IMS", /ims\W*registration|sip\W*register|ims\W*registered/i),
      step("SIP INVITE", "UE", "IMS", /sip\W*invite|\binvite\b/i),
      step("100 Trying", "IMS", "UE", /100\W*trying/i),
      step("183 Session Progress", "IMS", "UE", /183|session\W*progress/i),
      step("PRACK", "UE", "IMS", /\bprack\b/i),
      step("180 Ringing", "IMS", "UE", /180\W*ringing|\bring(?:ing)?\b/i),
      step("200 OK", "IMS", "UE", /200\W*ok/i),
      step("ACK", "UE", "IMS", /\back\b/i),
      step("RTP Voice LTE Anchor", "UE", "IMS", /\brtp\b|lte\W*anchor/i),
      step("User Data NR", "UE", "gNB", /user\W*data|throughput|nr\W*data/i),
    ],
  },
  {
    id: "sa-registration",
    name: "5G SA Registration",
    technology: "NR SA",
    access: "5G SA",
    objective: "UE registration with 5GC",
    nodes: ["UE", "gNB", "AMF", "SMF/UPF"],
    kpis: ["Registration Success", "Accessibility"],
    observation: "Registration and PDU session setup confirm 5GC access.",
    match: /5g\W*sa|nr\W*sa|registration\W*request|registration\W*accept|pdu\W*session|rrc\W*setup/i,
    steps: [
      step("Cell Selection", "UE", "gNB", /cell\W*selection/i),
      step("MIB/SIB", "gNB", "UE", /master\W*information|system\W*information|\bmib\b|\bsib\b/i),
      step("RRC Setup", "UE", "gNB", /rrc\W*setup/i),
      step("Registration Request", "UE", "AMF", /registration\W*request/i),
      step("Authentication", "AMF", "UE", /authentication\W*(request|response)?/i),
      step("Security Mode", "AMF", "UE", /security\W*mode/i),
      step("Registration Accept", "AMF", "UE", /registration\W*accept/i),
      step("Registration Complete", "UE", "AMF", /registration\W*complete/i),
      step("PDU Session Establishment", "UE", "SMF/UPF", /pdu\W*session\W*establishment/i),
    ],
  },
  {
    id: "sa-vonr",
    name: "5G SA VoNR",
    technology: "NR SA IMS",
    access: "5G SA",
    objective: "Voice over NR setup",
    nodes: ["UE", "gNB", "AMF/SMF", "IMS"],
    kpis: ["VoNR CSSR", "MOS", "QoS Flow Success"],
    observation: "QoS flow setup and SIP call setup define VoNR accessibility.",
    match: /vonr|voice\W*over\W*nr|qos\W*flow|rtp\W*voice\W*over\W*nr|sip\W*invite/i,
    steps: [
      step("IMS Registration", "UE", "IMS", /ims\W*registration|sip\W*register|ims\W*registered/i),
      step("QoS Flow Setup", "AMF/SMF", "UE", /qos\W*flow|5qi|pdu\W*session/i),
      step("SIP INVITE", "UE", "IMS", /sip\W*invite|\binvite\b/i),
      step("100 Trying", "IMS", "UE", /100\W*trying/i),
      step("183 Session Progress", "IMS", "UE", /183|session\W*progress/i),
      step("PRACK", "UE", "IMS", /\bprack\b/i),
      step("180 Ringing", "IMS", "UE", /180\W*ringing|\bring(?:ing)?\b/i),
      step("200 OK", "IMS", "UE", /200\W*ok/i),
      step("ACK", "UE", "IMS", /\back\b/i),
      step("RTP Voice over NR", "UE", "IMS", /rtp\W*voice\W*over\W*nr|\brtp\b/i),
      step("BYE", "UE", "IMS", /\bbye\b|disconnect/i),
    ],
  },
];

export function getFlowModel(modelId) {
  return NETWORK_FLOW_MODELS.find((model) => model.id === modelId) || null;
}

function itemText(item = {}) {
  return [
    item.title,
    item.summary,
    item.category,
    item.domain,
    item.rawMessage,
    item.eventKey,
    item.officialName,
    ...(item.details || []).flatMap((detail) => [detail.label, detail.value]),
  ].filter(Boolean).join(" ");
}

export function getMatchedFlowSteps(procedure = {}) {
  const text = (procedure.items || []).map(itemText).join(" ");
  return (procedure.flowModel?.steps || []).map((modelStep) => ({
    ...modelStep,
    observed: modelStep.test.test(text),
  }));
}

export function matchFlowModel(items = [], procedure = {}) {
  const text = [
    procedure.name,
    procedure.protocol,
    procedure.technology,
    procedure.servingCell,
    ...(items || []).map(itemText),
  ].filter(Boolean).join(" ");

  let best = null;
  let bestScore = 0;

  for (const model of NETWORK_FLOW_MODELS) {
    let score = model.match.test(text) ? 2 : 0;
    for (const modelStep of model.steps) {
      if (modelStep.test.test(text)) score += 1;
    }
    if (score > bestScore) {
      best = model;
      bestScore = score;
    }
  }

  return bestScore >= MODEL_MATCH_THRESHOLD ? best : null;
}
