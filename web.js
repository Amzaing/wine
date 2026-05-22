function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

var WebviewVideoPlayerImpl = {
  _resetCss() {
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style')
    stylesheets.forEach(sheet => sheet.remove())

    const elements = document.querySelectorAll('*')
    elements.forEach(element => {
      element.removeAttribute('style')
    })
  },

  _getVideoEl() {
    return document.querySelector('video')
  },

  async _waitVideoReady() {
    while (true) {
      const videoEl = this._getVideoEl()
      if (videoEl) return videoEl
      await delay(100)
    }
  },

  async _fullscreenVideo() {
    const videoEl = this._getVideoEl()
    videoEl.style = 'position: fixed; left: -1px; top: -1px; height: calc(100vh + 2px); width: calc(100vw + 2px); z-index: 99999; background: black;'

    for (const child of document.body.children) {
      child.style['z-index'] = -1
    }
  },

  async initialize() {
    await this._waitVideoReady()

    const error = await WebviewVideoPlayerImpl_hostInitialize[location.host]?.()
    if (error) return

    this._resetCss()
    this._fullscreenVideo()

    const videoEl = this._getVideoEl()
    videoEl.addEventListener('play', () => {
      WebviewVideoPlayerInterface.changeIsPlaying(true)
    })

    videoEl.addEventListener('pause', () => {
      WebviewVideoPlayerInterface.changeIsPlaying(false)
    })

    videoEl.addEventListener('timeupdate', () => {
      WebviewVideoPlayerInterface.changePosition(Math.floor(videoEl.currentTime * 1000))
    })

    videoEl.addEventListener('volumechange', () => {
      if (videoEl.volume === 0) videoEl.volume = 1
    })

    videoEl.volume = 1
    videoEl.autoplay = true

    await delay(500)
    if (videoEl.paused) videoEl.play()

    while (true) {
      await delay(100)
      if (videoEl.videoWidth * videoEl.videoHeight == 0) continue

      WebviewVideoPlayerInterface.changeResolution(videoEl.videoWidth, videoEl.videoHeight)
      break
    }

    while (true) {
      await delay(100)
      if (videoEl.volume != 0) break
      videoEl.volume = 1
    }
  },

  play() {
    this._getVideoEl()?.play()
  },

  pause() {
    this._getVideoEl()?.pause()
  },

  stop() {
    this.pause()
  },

  setVolume(volume) {
    const videoEl = this._getVideoEl()
    if (videoEl) videoEl.volume = volume
  },
}

var WebviewVideoPlayerImpl_hostInitialize = {
  'tv.cctv.com': async () => {
    const errorMsgEl = document.getElementById('error_msg_player')
    if (errorMsgEl) {
      WebviewVideoPlayerImpl._resetCss()
      errorMsgEl.style = 'position: fixed; left: -1px; top: -1px; height: calc(2px + 100vh); width: calc(2px + 100vw); z-index: 99999; background: black; color: white; font-size: 3vw; text-align: center; padding-top: 25%;'
      return true
    }
  },

  'live.snrtv.com': async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const channel = urlParams.get('channel')

    let liList = document.querySelectorAll('.btnStream > li')
    for (const li of liList) {
      if (li.innerText.includes(channel)) {
        li.click()
        break
      }
    }
  },

  'live.jstv.com': async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const channel = urlParams.get('channel')

    let liList = document.querySelector('#programMain')?.querySelectorAll('.swiper-slide') || []
    for (const li of liList) {
      if (li.innerText.includes(channel)) {
        li.querySelector('.imgBox')?.click()
        break
      }
    }
  },

  'www.nbs.cn': async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const channel = urlParams.get('channel')

    let liList = document.querySelectorAll('.tv_list > .tv_c')
    for (const li of liList) {
      if (li.innerText.includes(channel)) {
        li.click()
        break
      }
    }
  },

  'www.brtn.cn': async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const channel = urlParams.get('channel')

    let liList = document.querySelectorAll('.right_list li')
    for (const li of liList) {
      if (li.innerText.includes(channel)) {
        li.click()
        break
      }
    }
  },

  "web.guangdianyun.tv": async () => {
    while (true) {
      if (document.querySelector('video')?.videoWidth) break
      await delay(100)
    }
  },

// 新增：适配 央视频 (yangshipin.cn)
  'yangshipin.cn': async () => {
    let iframeEl = null
    
    // 1. 循环死等，直到网页把包含播放器的 iframe 渲染出来
    // 央视频的播放器 iframe 通常可以通过 src 包含 'player' 或者 className 带有 'player' 来识别
    while (true) {
      iframeEl = document.querySelector('iframe[src*="player"]') || document.querySelector('.video-player iframe') || document.querySelector('#player iframe')
      if (iframeEl) break
      await delay(200) // 每 200 毫秒找一次
    }

    // 2. 找到了 iframe，我们对最外层的网页进行净化
    WebviewVideoPlayerImpl._resetCss()

    // 3. 强行将这个 iframe 容器伪装成最顶层的视频元素
    // 这样它就会占满整个屏幕，且里面的视频会自动在 iframe 内部铺满
    iframeEl.style = 'position: fixed; left: -1px; top: -1px; height: calc(100vh + 2px); width: calc(100vw + 2px); z-index: 99999; background: black; border: none;'

    // 4. 将整个 body 的其他干扰子元素层级压低
    for (const child of document.body.children) {
      if (child !== iframeEl && !child.contains(iframeEl)) {
        child.style['z-index'] = -1
        child.style['display'] = 'none' // 央视频比较顽固，直接隐藏掉非播放器相关的父级同胞节点
      }
    }

    // 5. 核心拦截：
    // 因为真实的 <video> 在跨域的 iframe 内部，外层的 WebviewVideoPlayerImpl._getVideoEl() 会返回 null。
    // 为了防止主程序的 initialize() 报错或死循环，我们必须重写拦截掉 _getVideoEl 这一步！
    WebviewVideoPlayerImpl._getVideoEl = function() {
      // 欺骗主程序，把这个 iframe 当作 video 元素返回
      // 这样主程序对它的 .style 赋值和全屏操作依然有效，且不会陷入 _waitVideoReady 的死循环
      return iframeEl 
    }

    // 6. 伪造状态上报
    // 由于跨域限制，我们拿不到 iframe 内部视频的播放/暂停/分辨率事件
    // 为了防止客户端 App 一直显示“加载中”，我们在这里主动向原生接口发送一次“伪造成功”的通知
    setTimeout(() => {
      if (typeof WebviewVideoPlayerInterface !== 'undefined') {
        WebviewVideoPlayerInterface.changeIsPlaying(true) // 通知 App 正在播放
        WebviewVideoPlayerInterface.changeResolution(1920, 1080) // 伪报一个高清分辨率让 App 正常显示
      }
    }, 1500)

    return false // 返回 false，通知主程序继续执行余下的标准流程
  },
  
}
