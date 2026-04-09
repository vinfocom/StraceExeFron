 

export const filterOperators = (rawName) =>{
 if(!rawName) return null;

    const InvalidOperators = ['null', 'undefined', 'NaN', 'unknown', '000 000'];

    const name = rawName.trim().lowerCase();

    if(InvalidOperators.includes(name)){
        return null;
    }
    else{
        return name;
    }
}

export const filternetwork = (rawNetwork) => {
  if (!rawNetwork) return null;

  const network = rawNetwork.trim().toUpperCase();

  if (network.includes('5G')) {
    return '5G';
  } else if (network.includes('4G') || network.includes('LTE')) {
    return '4G';
  } else if (network.includes('3G')) {
    return '3G';
  } else {
    return null;
  }
};

export const NormaliseOperator = (rawName) => {
  const name = filterOperators(rawName);
  if(!name) return null;  

  if(name.includes('vodafone')) return 'vodafone';
}


