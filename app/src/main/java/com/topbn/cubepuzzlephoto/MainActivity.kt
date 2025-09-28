package com.topbn.cubepuzzlephoto

import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.topbn.cubepuzzlephoto.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var mInterstitialAd: InterstitialAd? = null

    companion object {
        private const val INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-1750975067701107/7523383014" // Test Interstitial
        private const val AD_TAG = "AdMob"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val bannerAdRequest = AdRequest.Builder().build()
        binding.adView.loadAd(bannerAdRequest)

        loadInterstitialAd()
        setupWebView()
        handleBackButton()

        binding.webView.requestFocus()
    }

    private fun setupWebView() {
        binding.webView.apply {
            settings.javaScriptEnabled = true

            settings.allowFileAccessFromFileURLs = true

            isFocusable = true
            isFocusableInTouchMode = true

            webViewClient = WebViewClient()
            val webAppInterface = WebAppInterface()
            addJavascriptInterface(webAppInterface, "Android")
            tag = webAppInterface
            loadUrl("file:///android_asset/index.html")
        }
    }

    private fun handleBackButton() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    private fun loadInterstitialAd() {
        val adRequest = AdRequest.Builder().build()
        InterstitialAd.load(this, INTERSTITIAL_AD_UNIT_ID, adRequest,
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(interstitialAd: InterstitialAd) {
                    mInterstitialAd = interstitialAd
                    Log.d(AD_TAG, "Interstitial Ad was loaded.")
                }
                override fun onAdFailedToLoad(adError: LoadAdError) {
                    Log.d(AD_TAG, "Interstitial Ad failed to load: ${adError.message}")
                    mInterstitialAd = null
                }
            })
    }

    private inner class WebAppInterface {
        @JavascriptInterface
        fun showInterstitialAd() {
            this@MainActivity.runOnUiThread {
                if (mInterstitialAd != null) {
                    mInterstitialAd?.show(this@MainActivity)
                    loadInterstitialAd()
                } else {
                    Log.d(AD_TAG, "Interstitial ad wasn't ready yet.")
                    loadInterstitialAd()
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (event?.action == KeyEvent.ACTION_DOWN) {
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> {
                    binding.webView.evaluateJavascript("window.AndroidInterface.performMove('U')", null)
                    return true
                }
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    binding.webView.evaluateJavascript("window.AndroidInterface.performMove('D')", null)
                    return true
                }
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    binding.webView.evaluateJavascript("window.AndroidInterface.performMove('L')", null)
                    return true
                }
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    binding.webView.evaluateJavascript("window.AndroidInterface.performMove('R')", null)
                    return true
                }
                KeyEvent.KEYCODE_BUTTON_X, KeyEvent.KEYCODE_BUTTON_A -> { // Shuffle or primary action
                    binding.webView.evaluateJavascript("window.AndroidInterface.shuffleCube()", null)
                    return true
                }
                KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_BUTTON_B -> { // Reset or secondary action
                    binding.webView.evaluateJavascript("window.AndroidInterface.resetCubeState()", null)
                    return true
                }
                KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_R1 -> { // Undo
                    binding.webView.evaluateJavascript("window.AndroidInterface.undoLastMove()", null)
                    return true
                }
                KeyEvent.KEYCODE_BUTTON_SELECT, KeyEvent.KEYCODE_BUTTON_START -> { // Instructions
                    binding.webView.evaluateJavascript("window.AndroidInterface.openInstructions()", null)
                    return true
                }
                KeyEvent.KEYCODE_BUTTON_C, KeyEvent.KEYCODE_BUTTON_L2 -> { // Toggle Prime Mode
                    binding.webView.evaluateJavascript("window.AndroidInterface.togglePrimeMode()", null)
                    return true
                }
                KeyEvent.KEYCODE_BUTTON_R2 -> { // Hint
                    binding.webView.evaluateJavascript("window.AndroidInterface.showHint()", null)
                    return true
                }
                KeyEvent.KEYCODE_BUTTON_THUMBL, KeyEvent.KEYCODE_BUTTON_THUMBR -> {
                    binding.webView.evaluateJavascript("window.AndroidInterface.setDifficulty('Medium')", null)
                    return true
                }
                KeyEvent.KEYCODE_BACK -> {
                    if (binding.webView.canGoBack()) {
                        binding.webView.goBack()
                    } else {
                        finish()
                    }
                    return true
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}
