import React from 'react'
import { Layout } from 'antd'
import { contracts, initContractsByNames, constants as metaWeb3Constants } from 'meta-web3'

import { TopNav, FootNav, StakingModal, ErrModal, AccessFailedModal, Voting, Authority, BaseLoader } from './components'
import getWeb3Instance, { web3Instance } from './web3'
import { constants } from './constants'
import * as util from './util'

import './App.css'

const { Header, Content, Footer } = Layout

class App extends React.Component {
  data = {
    myBalance: 0,
    myLockedBalance: 0,
    stakingTopic: 'deposit',
    stakingAmount: '',
    stakingMax: null,
    stakingMin: null,
    eventsWatch: null,
    ballotMemberOriginData: {},
    ballotBasicOriginData: {},
    voteLength: 0,
    authorityOriginData: [],
    errTitle: null,
    errContent: null,
    errLink: null,
    errAccessFail: null,
    isMember: false
  }

  state = {
    loadWeb3: false,
    accessFailMsg: null,
    nav: '1',
    contractReady: false,
    stakingModalVisible: false,
    errModalVisible: false,
    errStakging: false,
    loading: false,
    showProposal: false
  };

  constructor (props) {
    super(props)
    this.initContractData = this.initContractData.bind(this)
    this.refreshContractData = this.refreshContractData.bind(this)

    /* Get web3 instance. */
    getWeb3Instance().then(async web3Config => {
      this.initContracts(web3Config)
      console.log('debugMode: ', constants.debugMode)
      this.setState({ loadWeb3: true })
    }, async error => {
      console.log('getWeb3 error: ', error)
      this.setState({ loadWeb3: false, accessFailMsg: error.message })
    })
  }

  async initContracts (web3Config) {
    initContractsByNames({
      web3: web3Config.web3,
      branch: web3Config.branch,
      names: web3Config.names
    }).then(async () => {
      await this.getStakingRange()
      await this.initContractData()
      await this.updateAccountBalance()
      window.ethereum.on('accountsChanged', async (chagedAccounts) => {
        await this.updateDefaultAccount(chagedAccounts[0])
      })
      this.setStakingEventsWatch()
      this.data.isMember = await contracts.governance.isMember(web3Instance.defaultAccount)
      this.setState({ contractReady: true })
    })
  }

  async updateAccountBalance () {
    this.data.myBalance = await contracts.staking.balanceOf(web3Instance.defaultAccount)
    this.data.myLockedBalance = await contracts.staking.lockedBalanceOf(web3Instance.defaultAccount)
    this.data.myBalance = web3Instance.web3.utils.fromWei(this.data.myBalance, 'ether')
    this.data.myLockedBalance = web3Instance.web3.utils.fromWei(this.data.myLockedBalance, 'ether')
    this.setState({ stakingModalVisible: false, loading: false })
  }

  async updateDefaultAccount (account) {
    if (web3Instance.defaultAccount.toLowerCase() !== account.toLowerCase()) {
      web3Instance.defaultAccount = account
      await this.updateAccountBalance()
      this.setStakingEventsWatch()
      this.data.isMember = await contracts.governance.isMember(web3Instance.defaultAccount)
      this.setState({ showProposal: false })
    }
  }

  setStakingEventsWatch () {
    if (this.data.eventsWatch) {
      this.data.eventsWatch.unsubscribe((error, success) => {
        if (error) console.log('Faild to unsubscribed!')
        // else if (success) console.log('Successfully unsubscribed!')
      })
    }
    var filteraddress = web3Instance.web3.eth.abi.encodeParameter('address', web3Instance.defaultAccount)
    this.data.eventsWatch = contracts.staking.stakingInstance.events.allEvents(
      {
        fromBlock: 'latest',
        topics: [null, filteraddress]
      }, (error, events) => {
        // console.log(events)
        if (error) console.log('error', error)
        else this.updateAccountBalance()
      }
    )
  }

  async getStakingRange () {
    if (['MAINNET', 'TESTNET'].includes(web3Instance.netName)) {
      this.data.stakingMin = web3Instance.web3.utils.fromWei(await contracts.envStorage.getStakingMin())
      this.data.stakingMax = web3Instance.web3.utils.fromWei(await contracts.envStorage.getStakingMax())
    }
  }

  async initContractData() {
    await this.getAuthorityData()
    await this.initBallotData()
    util.setUpdateTimeToLocal(new Date())
  }

  async refreshContractData(forced=false) {
    if(util.getUpdateTimeFromLocal.value + 300000 > Date.now() || !forced) return
    await this.getAuthorityData()
    await this.getBallotData()
    await this.modifyBallotData()
    util.setUpdateTimeToLocal(new Date())
  }

  async getAuthorityData() {
    const modifiedBlock = await contracts.governance.govInstance.methods.modifiedBlock().call() // need to edit contract
    if(modifiedBlock === util.getModifiedFromLocal() && util.getAuthorityFromLocal()) {
      this.data.authorityOriginData = util.getAuthorityFromLocal()
      return
    }
    await this.initAuthorityData()
    util.setModifiedToLocal(modifiedBlock)
  }

  async getBallotData() {
    const ballotCnt = await contracts.governance.getBallotLength()
    let localBallotCnt = Object.keys(this.data.ballotBasicOriginData).length
    if(!ballotCnt || ballotCnt === localBallotCnt) return

    for(localBallotCnt += 1; localBallotCnt <= ballotCnt; localBallotCnt++) {
      await this.getBallotBasicOriginData(localBallotCnt)
      await this.getBallotMemberOriginData(localBallotCnt)
    }
  }

  async modifyBallotData() {
    let voteLength = await contracts.governance.govInstance.methods.voteLength.call() // need to edit contract
    if(!voteLength || voteLength === this.data.voteLength) return

    for(this.data.voteLength += 1; this.data.voteLength <= voteLength; this.data.voteLength++) {
      const ballotId = await contracts.ballotStorage.ballotStorageInstance.methods.getVote(this.data.voteLength).call() // need to edit contract
      await this.getBallotBasicOriginData(ballotId)
      await this.getBallotMemberOriginData(ballotId)
    }
    this.data.voteLength -= 1
  }

  async initAuthorityData() {
    let authorityOriginData = await util.getAuthorityLists(
      constants.authorityRepo.org,
      constants.authorityRepo.repo,
      constants.authorityRepo.branch,
      constants.authorityRepo.source
    )
    this.data.authorityOriginData = await this.refineAuthority(authorityOriginData)
    util.setAuthorityToLocal(this.data.authorityOriginData)
  }

  async refineAuthority (authorityList) {
    let memberAuthority = {}
    let index = 0
    for (let i = 0; i < Object.keys(authorityList).length; i++) {
      if(await contracts.governance.isMember(authorityList[i].addr)) {
        memberAuthority[index] = authorityList[i]
        memberAuthority[index].addr = web3Instance.web3.utils.toChecksumAddress(memberAuthority[index].addr)
        index++
      }
    }
    return memberAuthority
  }

  async initBallotData() {
    let ballotBasicFinalizedData = util.getBallotBasicFromLocal() ? util.getBallotBasicFromLocal() : {}
    let ballotMemberFinalizedData = util.getBallotMemberFromLocal() ? util.getBallotMemberFromLocal() : {}
    let localDataUpdate = false

    this.data.voteLength = contracts.governance.govInstance.voteLength
    const ballotCnt = await contracts.governance.getBallotLength()
    if(!ballotCnt) return
    for(var i = 1; i <= ballotCnt; i++) {
      let isUpdate
      if(i in ballotBasicFinalizedData) {
        this.data.ballotBasicOriginData[i] = (ballotBasicFinalizedData[i])
        this.data.ballotMemberOriginData[i] = ballotMemberFinalizedData[i]
      } else {
        isUpdate = await this.getBallotBasicOriginData(i, ballotBasicFinalizedData)
        await this.getBallotMemberOriginData(i, isUpdate, ballotMemberFinalizedData)
        if(isUpdate) localDataUpdate = true
      }
    }

    if(localDataUpdate) {
      util.setBallotBasicToLocal(ballotBasicFinalizedData)
      util.setBallotMemberToLocal(ballotMemberFinalizedData)
    }
  }

  async getBallotBasicOriginData (i, ballotBasicFinalizedData = false) {
    let isUpdate = false
    await contracts.ballotStorage.getBallotBasic(i).then(
      ret => {
        ret.id = i // Add ballot id
        util.refineBallotBasic(ret)
        this.data.ballotBasicOriginData[i] = ret
        if(!ballotBasicFinalizedData) return
        if(ret.state === constants.ballotState.Accepted || ret.state === constants.ballotState.Rejected) {
          ballotBasicFinalizedData[i] = ret
          isUpdate = true
        }
      }
    )
    return isUpdate
  }

  async getBallotMemberOriginData (i, isUpdate = false, ballotMemberFinalizedData) {
    await contracts.ballotStorage.getBallotMember(i).then(
      ret => {
        ret.id = i // Add ballot id
        this.data.ballotMemberOriginData[i] = ret
        if(isUpdate) ballotMemberFinalizedData[i] = ret
      })
  }

  onMenuClick = ({ key }) => {
    if (this.state.showProposal && this.state.nav === '2' && key === '2') {
      this.convertVotingComponent('voting')
    } else {
      this.setState({ nav: key })
    }
  }

  onClickFootIcon = (e) => {
    switch (e.target.alt) {
      case 'metadium': window.open('https://metadium.com/', '_blank'); break
      case 'explorer': window.open(metaWeb3Constants.NETWORK[web3Instance.netId].EXPLORER); break
      case 'github': window.open('https://github.com/METADIUM/', '_blank'); break
      default:
    }
  }

  getContent () {
    if (!this.state.loadWeb3) return
    this.refreshContractData()
    switch (this.state.nav) {
      case '1':
        return <Authority
          title='Authority'
          contracts={contracts}
          getErrModal={this.getErrModal}
          authorityOriginData={this.data.authorityOriginData}
          netName={web3Instance.netName}
        />
      case '2':
        return <Voting
          title='Voting'
          contracts={contracts}
          getErrModal={this.getErrModal}
          initContractData={this.initContractData}
          refreshContractData={this.refreshContractData}
          authorityOriginData={this.data.authorityOriginData}
          ballotMemberOriginData={this.data.ballotMemberOriginData}
          ballotBasicOriginData={this.data.ballotBasicOriginData}
          convertVotingComponent={this.convertVotingComponent}
          loading={this.state.loading}
          convertLoading={this.convertLoading}
          showProposal={this.state.showProposal}
          isMember={this.data.isMember}
          stakingMax={this.data.stakingMax}
          stakingMin={this.data.stakingMin}
        />
      default:
    }
    this.setState({ selectedMenu: true })
  }

  convertVotingComponent = (component) => {
    switch (component) {
      case 'voting': this.setState({ showProposal: false }); break
      case 'proposal': this.setState({ showProposal: true }); break
      default: break
    }
  }

  convertLoading = (state) => {
    if (typeof (state) === 'boolean') {
      this.setState({ loading: state })
    }
  }

  getErrModal = (_err = 'Unknown Error', _title = 'Unknown Error', _link = false) => {
    if (_err.includes('error:')) _err = _err.split('error:')[1]

    this.data.errTitle = _title
    this.data.errContent = _err
    if (_link) this.data.errLink = metaWeb3Constants.NETWORK[web3Instance.netId] + _link
    else this.data.errLink = false
    this.setState({ errModalVisible: true })
  }

  getStakingModal = () => {
    this.data.stakingAmount = ''
    this.data.stakingTopic = 'deposit'
    this.setState({ stakingModalVisible: true })
  }

  submitMetaStaking = () => {
    if (!/^[1-9]\d*$/.test(this.data.stakingAmount)) {
      this.setState({ errStakging: true })
      return
    }

    this.setState({ loading: true })
    let trx = {}
    // console.log('before this.data.stakingAmount;', this.data.stakingAmount)
    let amount = web3Instance.web3.utils.toWei(this.data.stakingAmount, 'ether')
    // console.log('after this.data.stakingAmount;', amount)
    if (this.data.stakingTopic === 'deposit') {
      // console.log('Send Transaction for deposit')
      trx = contracts.staking.deposit()
      web3Instance.web3.eth.sendTransaction({
        from: web3Instance.defaultAccount,
        value: amount,
        to: trx.to,
        data: trx.data
      }, async (err, hash) => {
        if (err) {
          console.log(err)
          this.getErrModal(err.message, 'Deposit Error')
          this.setState({ stakingModalVisible: false, loading: false })
        } else {
          console.log('hash: ', hash)
        }
      })
    } else {
      trx = contracts.staking.withdraw(amount)
      web3Instance.web3.eth.sendTransaction({
        from: web3Instance.defaultAccount,
        to: trx.to,
        data: trx.data
      }, async (err, hash) => {
        if (err) {
          console.log(err)
          this.getErrModal(err.message, 'Withdraw Error')
          this.setState({ stakingModalVisible: false, loading: false })
        } else {
          console.log('hash: ', hash)
        }
      })
    }
  }

  handleSelectChange = (topic) => {
    this.data.stakingTopic = topic
    this.setState({})
  }

  handleInputChange = (event) => {
    let value = event.target.value
    if (/^([0-9]*)$/.test(value)) {
      this.data.stakingAmount = value
      this.setState({ errStakging: false })
    }
  }

  render () {
    return (
      <Layout className='layout'>
        <AccessFailedModal
          visible={!!this.state.accessFailMsg}
          message={this.state.accessFailMsg}
        />

        {this.state.contractReady && this.state.loadWeb3
          ? <div className='flex-column'>
            <Header className={web3Instance.netName}>
              <TopNav
                netName={web3Instance.netName}
                nav={this.state.nav}
                myBalance={this.data.myBalance}
                myLockedBalance={this.data.myLockedBalance}
                onMenuClick={this.onMenuClick}
                getStakingModal={this.getStakingModal}
              />
            </Header>

            <StakingModal
              netName={web3Instance.netName}
              accountBalance={{ balance: this.data.myBalance, lockedBalance: this.data.myLockedBalance }}
              stakingModalVisible={this.state.stakingModalVisible}
              loading={this.state.loading}
              stakingAmount={this.data.stakingAmount}
              errStakging={this.state.errStakging}
              stakingTopic={this.data.stakingTopic}
              hideStakingModal={() => { if (!this.state.loading) this.setState({ stakingModalVisible: false }) }}
              submitMetaStaking={this.submitMetaStaking}
              handleInputChange={this.handleInputChange}
              handleSelectChange={this.handleSelectChange}
            />

            <ErrModal
              netName={web3Instance.netName}
              title={this.data.errTitle}
              err={this.data.errContent}
              link={this.data.errLink}
              visible={this.state.errModalVisible}
              coloseErrModal={() => this.setState({ errModalVisible: !this.state.loadWeb3 })} />

            <Content>
              {this.state.loadWeb3
                ? <div> {this.getContent()} </div>
                : this.getErrModal('This is an unknown network. Please connect to Metadium network', 'Connecting Error')
              }
            </Content>

            <Footer>
              <FootNav
                netName={web3Instance.netName}
                onClickFootIcon={this.onClickFootIcon}
              />
            </Footer>
          </div>
          : <div>
            <BaseLoader />
          </div>
        }
      </Layout>
    )
  }
}

export default App
