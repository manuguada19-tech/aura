package es.citasaura.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private WebView auraWebView;
    private int lastKeyboardInsetCss = -1;

    private static final String NATIVE_LAYOUT_JS =
        "(function(){" +
        "document.documentElement.classList.add('aura-native-android');" +
        "if(!document.getElementById('aura-native-layout')){" +
        "var s=document.createElement('style');" +
        "s.id='aura-native-layout';" +
        "s.textContent='@media (max-width:900px){' +" +
        "'.aura-native-android .screen-discover .action-row{' +" +
        "'transform:translateY(var(--aura-native-actions-shift,0px)) !important}' +" +
        "'.aura-native-review-open #themeToggle{display:none !important}' +" +
        "'.aura-native-android .review-screen{' +" +
        "'height:100% !important;min-height:100% !important;overflow:hidden !important;' +" +
        "'padding:14px 16px 16px !important;gap:10px !important;' +" +
        "'justify-content:space-between !important}' +" +
        "'.aura-native-android .review-screen .beta-hero{gap:7px !important;margin-top:0 !important}' +" +
        "'.aura-native-android .review-screen .beta-badge{' +" +
        "'width:70px !important;height:70px !important;border-radius:19px !important}' +" +
        "'.aura-native-android .review-screen .beta-badge svg{' +" +
        "'width:36px !important;height:36px !important}' +" +
        "'.aura-native-android .review-screen .beta-pill{' +" +
        "'padding:6px 12px !important;font-size:12px !important}' +" +
        "'.aura-native-android .review-screen .beta-title{' +" +
        "'font-size:24px !important;margin:2px 0 0 !important}' +" +
        "'.aura-native-android .review-screen .beta-sub{' +" +
        "'font-size:14px !important;line-height:1.45 !important}' +" +
        "'.aura-native-android .review-screen .review-temp{' +" +
        "'padding:8px 12px !important;font-size:13px !important}' +" +
        "'.aura-native-android .review-screen .beta-card{' +" +
        "'padding:12px !important;gap:8px !important;border-radius:16px !important}' +" +
        "'.aura-native-android .review-screen .beta-point{' +" +
        "'padding:3px 2px !important;gap:10px !important;align-items:center !important}' +" +
        "'.aura-native-android .review-screen .beta-point-ic{' +" +
        "'width:34px !important;height:34px !important;flex:0 0 34px !important;' +" +
        "'font-size:17px !important;border-radius:11px !important}' +" +
        "'.aura-native-android .review-screen .beta-point-h{font-size:13.5px !important}' +" +
        "'.aura-native-android .review-screen .beta-point-p{' +" +
        "'display:block !important;font-size:12.5px !important;line-height:1.3 !important;margin-top:1px !important}' +" +
        "'.aura-native-android .review-screen .beta-actions{margin-top:0 !important}' +" +
        "'.aura-native-android .review-screen .beta-actions .btn{min-height:46px !important}' +" +
        "'.aura-native-android .review-screen .beta-admin{' +" +
        "'margin-top:0 !important;padding-top:8px !important}' +" +
        "'.aura-native-android .review-screen .beta-foot{margin-top:0 !important;font-size:12px !important}' +" +
        "'.aura-native-admin-open .review-screen:after{' +" +
        "'content:\"\";position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:9000}' +" +
        "'.aura-native-admin-open .review-screen .beta-admin{' +" +
        "'position:fixed !important;z-index:9001;left:14px;right:14px;' +" +
        "'top:var(--aura-native-admin-top,12px);margin:0 !important;padding:12px !important;' +" +
        "'border:1px solid rgba(255,255,255,.18) !important;border-radius:16px;' +" +
        "'background:#171923;box-shadow:0 18px 48px rgba(0,0,0,.48)}' +" +
        "'.aura-native-admin-open .review-screen .beta-admin-toggle{' +" +
        "'padding:2px 8px 8px !important;font-size:14px !important;opacity:1 !important}' +" +
        "'.aura-native-admin-open .review-screen .beta-admin-panel{' +" +
        "'display:grid !important;grid-template-columns:minmax(0,1fr) auto;' +" +
        "'gap:8px !important;margin-top:0 !important;padding:0 !important}' +" +
        "'.aura-native-admin-open .review-screen .beta-admin-input{' +" +
        "'width:100% !important;min-height:48px !important;font-size:16px !important}' +" +
        "'.aura-native-admin-open .review-screen .beta-admin-cta{' +" +
        "'min-width:92px !important;min-height:48px !important}' +" +
        "'.aura-native-admin-open .review-screen .beta-admin-fb{grid-column:1/-1}' +" +
        "'}';" +
        "document.head.appendChild(s);" +
        "}" +
        "var pending=false;" +
        "var fullHeight=window.innerHeight;" +
        "function fitActions(){" +
        "var row=document.querySelector('.screen-discover .action-row');" +
        "var tabs=document.getElementById('tabbar');" +
        "if(!row||!tabs||tabs.hidden)return;" +
        "row.style.setProperty('--aura-native-actions-shift','0px');" +
        "var gap=tabs.getBoundingClientRect().top-row.getBoundingClientRect().bottom;" +
        "var shift=Math.max(0,Math.min(64,gap-24));" +
        "row.style.setProperty('--aura-native-actions-shift',shift+'px');" +
        "}" +
        "function fitReview(){" +
        "var doc=document.documentElement;" +
        "var review=document.querySelector('.review-screen');" +
        "doc.classList.toggle('aura-native-review-open',!!review);" +
        "var panel=review&&review.querySelector('.beta-admin-panel');" +
        "var box=review&&review.querySelector('.beta-admin');" +
        "var open=!!(panel&&box&&!panel.hidden);" +
        "doc.classList.toggle('aura-native-admin-open',open);" +
        "if(!open){doc.style.removeProperty('--aura-native-admin-top');return;}" +
        "var keyboard=Math.max(0,Number(window.__auraNativeKeyboardInset)||0);" +
        "if(!keyboard)fullHeight=Math.max(fullHeight,window.innerHeight);" +
        "var vv=window.visualViewport;" +
        "var visibleTop=vv?vv.offsetTop:0;" +
        "var layoutShrunk=window.innerHeight<fullHeight-60;" +
        "var visibleBottom=layoutShrunk?window.innerHeight:window.innerHeight-keyboard;" +
        "if(!layoutShrunk&&vv&&vv.height<window.innerHeight-60){visibleBottom=vv.offsetTop+vv.height;}" +
        "var boxHeight=box.getBoundingClientRect().height||120;" +
        "var top=Math.max(visibleTop+8,visibleBottom-boxHeight-10);" +
        "doc.style.setProperty('--aura-native-admin-top',top+'px');" +
        "review.scrollTop=0;" +
        "}" +
        "function fitLayout(){pending=false;fitActions();fitReview();}" +
        "function schedule(){if(pending)return;pending=true;requestAnimationFrame(fitLayout);}" +
        "schedule();" +
        "window.addEventListener('resize',schedule);" +
        "window.addEventListener('aura-native-insets',schedule);" +
        "if(window.visualViewport){window.visualViewport.addEventListener('resize',schedule);" +
        "window.visualViewport.addEventListener('scroll',schedule);}" +
        "document.addEventListener('click',function(e){" +
        "if(e.target&&e.target.closest&&e.target.closest('.review-screen .beta-admin-toggle')){" +
        "setTimeout(schedule,0);setTimeout(schedule,120);setTimeout(schedule,320);}" +
        "},true);" +
        "new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});" +
        "})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Android 15+ dibuja las aplicaciones de borde a borde. Ajustamos el
        // contenedor nativo para que la web no quede debajo de la cámara, la
        // barra de estado, los laterales ni la navegación del sistema.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.BLACK);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets safe = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
            );
            Insets keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(
                safe.left,
                safe.top,
                safe.right,
                safe.bottom
            );
            int keyboardInsetPx = Math.max(0, keyboard.bottom - safe.bottom);
            int keyboardInsetCss = Math.round(
                keyboardInsetPx / getResources().getDisplayMetrics().density
            );
            dispatchKeyboardInset(keyboardInsetCss);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);

        // La web se sirve desde el dominio público. Esta clase y su regla local
        // permiten validar el ajuste Android sin publicar todavía la web.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                auraWebView = webView;
                webView.evaluateJavascript(NATIVE_LAYOUT_JS, null);
                dispatchKeyboardInset(lastKeyboardInsetCss < 0 ? 0 : lastKeyboardInsetCss);
            }
        });
    }

    private void dispatchKeyboardInset(int keyboardInsetCss) {
        lastKeyboardInsetCss = keyboardInsetCss;
        WebView webView = auraWebView;
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
            "window.__auraNativeKeyboardInset=" + keyboardInsetCss + ";" +
            "window.dispatchEvent(new Event('aura-native-insets'));",
            null
        ));
    }
}
