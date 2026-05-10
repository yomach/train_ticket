package com.yomach.trainticket;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

// One-shot SMS auto-fill via Android's SMS User Consent API. The system
// shows a one-tap dialog when a matching SMS arrives; on consent, we get
// the body and pull the OTP digits out. No RECEIVE_SMS permission needed.
@CapacitorPlugin(name = "SmsUserConsent")
public class SmsUserConsentPlugin extends Plugin {

    // rail.co.il OTPs are short numeric codes; tolerate 4-10 digits.
    private static final Pattern OTP_PATTERN = Pattern.compile("\\b(\\d{4,10})\\b");

    private BroadcastReceiver smsReceiver;

    @PluginMethod
    public void startListening(final PluginCall call) {
        // Optional sender filter (E.164). Null = listen for any sender.
        final String senderPhone = call.getString("senderPhone");

        SmsRetriever.getClient(getContext())
                .startSmsUserConsent(senderPhone)
                .addOnSuccessListener(unused -> registerReceiver(call))
                .addOnFailureListener(e -> call.reject("startSmsUserConsent failed: " + e.getMessage()));
    }

    private void registerReceiver(final PluginCall call) {
        unregisterReceiverIfAny();
        smsReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) return;
                Bundle extras = intent.getExtras();
                if (extras == null) return;
                Status status = (Status) extras.get(SmsRetriever.EXTRA_STATUS);
                if (status == null) return;

                if (status.getStatusCode() == CommonStatusCodes.SUCCESS) {
                    Intent consentIntent = extras.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT);
                    if (consentIntent != null) {
                        try {
                            startActivityForResult(call, consentIntent, "smsConsentResult");
                        } catch (Exception e) {
                            call.reject("startActivityForResult failed: " + e.getMessage());
                        }
                    } else {
                        call.reject("No consent intent in broadcast");
                    }
                } else if (status.getStatusCode() == CommonStatusCodes.TIMEOUT) {
                    call.reject("Timed out waiting for SMS (5min)");
                } else {
                    call.reject("SMS retriever status: " + status.getStatusCode());
                }
                unregisterReceiverIfAny();
            }
        };

        IntentFilter filter = new IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION);
        // Android 13+ requires explicit exported flag. RECEIVER_EXPORTED is
        // safe here because SmsRetriever.SEND_PERMISSION restricts the
        // sender to Google Play Services.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(
                    smsReceiver, filter, SmsRetriever.SEND_PERMISSION, null, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(
                    smsReceiver, filter, SmsRetriever.SEND_PERMISSION, null);
        }
    }

    private void unregisterReceiverIfAny() {
        if (smsReceiver != null) {
            try {
                getContext().unregisterReceiver(smsReceiver);
            } catch (IllegalArgumentException ignored) {
            }
            smsReceiver = null;
        }
    }

    @ActivityCallback
    private void smsConsentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            String message = result.getData().getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE);
            String otp = extractOtp(message);
            if (otp == null) {
                call.reject("Could not extract OTP from SMS");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("otp", otp);
            ret.put("message", message != null ? message : "");
            call.resolve(ret);
        } else {
            call.reject("User dismissed SMS consent");
        }
    }

    private static String extractOtp(String body) {
        if (body == null) return null;
        Matcher m = OTP_PATTERN.matcher(body);
        return m.find() ? m.group(1) : null;
    }

    @Override
    protected void handleOnDestroy() {
        unregisterReceiverIfAny();
        super.handleOnDestroy();
    }
}
