import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Legge le credenziali dalle variabili d'ambiente (mai scritte nel codice)
SENDER_EMAIL = os.environ.get("MH_MAIL_USER", "monarchhoard.noreply@gmail.com")
SENDER_PASSWORD = os.environ.get("MH_MAIL_PASSWORD")  # la App Password di 16 caratteri


def send_verification_email(to_email, verify_link):
    """Invia l'email di conferma registrazione. Ritorna True se ok, False se errore."""
    if not SENDER_PASSWORD:
        print("[EMAIL] MH_MAIL_PASSWORD mancante: impossibile inviare.")
        return False

    subject = "Conferma la tua registrazione - Monarch Hoard"

    # Corpo in HTML, coerente con il tema viola dell'app
    html = """
    <div style="background:#05020d; padding:30px; font-family:Arial,sans-serif; color:#e4d8ff;">
      <div style="max-width:480px; margin:0 auto; background:#0d0a1c;
                  border:1px solid rgba(155,77,255,0.35); border-radius:14px; padding:30px; text-align:center;">
        <h1 style="color:#b98cff; font-size:22px; margin-bottom:10px;">Benvenuto in Monarch Hoard</h1>
        <p style="color:#9a8ab8; font-size:14px; line-height:1.6;">
          Grazie per esserti registrato! Clicca il pulsante qui sotto per
          confermare la tua email e attivare l'account.
        </p>
        <a href="__LINK__"
           style="display:inline-block; margin:22px 0; padding:14px 34px;
                  background:rgba(155,77,255,0.20); border:1px solid rgba(155,77,255,0.6);
                  border-radius:8px; color:#ffffff; text-decoration:none;
                  font-weight:bold; letter-spacing:1px;">
          Conferma Email
        </a>
        <p style="color:#75668f; font-size:12px; line-height:1.6;">
          Se il pulsante non funziona, copia e incolla questo link nel browser:<br>
          <span style="color:#b98cff; word-break:break-all;">__LINK__</span>
        </p>
      </div>
    </div>
    """.replace("__LINK__", verify_link)

    message = MIMEMultipart("alternative")
    message["From"] = "Monarch Hoard <" + SENDER_EMAIL + ">"
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, [to_email], message.as_string())
        print("[EMAIL] Inviata a " + to_email)
        return True
    except Exception as e:
        print("[EMAIL] Errore invio: " + str(e))
        return False