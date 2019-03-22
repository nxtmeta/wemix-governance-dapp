let constants = {}
constants.organization = 'METADIUM'
constants.repoName = 'governance-spec'
constants.addressesSourceFile = 'contracts.json'
constants.ABIsSources = {
  // contracts.json: contract address
  Registry: 'Registry.json',
  Staking: 'Staking.json',
  EnvStorage: 'EnvStorageImp.json',
  BallotStorage: 'BallotStorage.json',
  Gov: 'Gov.json',
  GovImp: 'GovImp.json'
}
constants.NET_ID = '11'
constants.branchName = 'mainnet'

constants.NETWORKS = {
  '12': {
    NAME: 'TESTNET',
    RPC: 'https://api.metadium.com/dev',
    BRANCH: 'testnet',
    NETWORK: 'private',
    TESTNET: true,
    explorerUrl: 'https://testnetexplorer.metadium.com/txs/'
  },
  '11': {
    NAME: 'MAINNET',
    RPC: 'https://api.metadium.com/prod',
    BRANCH: 'mainnet',
    NETWORK: 'private',
    TESTNET: false,
    explorerUrl: 'https://explorer.metadium.com/txs/'
  }
}

constants.authorityRepo = {
  org: 'METADIUM',
  repo: 'meta-authorities',
  branch: 'master',
  source: 'authorities.json'
}

/**
 * BallotEnums
 */
constants.ballotState = {
  Invalid: '0',
  Ready: '1',
  InProgress: '2',
  Accepted: '3',
  Rejected: '4',
  Canceled: '5'
}

constants.ballotTypes = {
  Invalid: '0',
  MemverAdd: '1',
  MemberRemoval: '2',
  MemberChange: '3',
  GovernanceChange: '4',
  EnvValChange: '5'
}

constants.ballotStateArr = ['Invalid', 'Ready', 'InProgress', 'Accepted', 'Rejected', 'Canceled']
constants.ballotTypesArr = ['Invalid', 'MemberAdd', 'MemberRemoval', 'MemberChange', 'GovernanceChange', 'EnvValChange']

export { constants }
