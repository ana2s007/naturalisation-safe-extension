(async function () {
  const CONFIG = {
    URL_PATTERN: "administration-etrangers-en-france",
    TAB_NAME: "Demande d'accès à la Nationalité Française",
    API_ENDPOINT:
      "https://administration-etrangers-en-france.interieur.gouv.fr/api/anf/dossier-stepper",
    API_DOSSIER_ENDPOINT:
      "https://administration-etrangers-en-france.interieur.gouv.fr/api/anf/usager/dossiers/",
    WAIT_TIME: 100,
  };

  const extensionVersion = "2.8";

  if (!window.location.href.includes(CONFIG.URL_PATTERN)) return;

  try {
    // Fonction pour attendre l'élément de l'onglet
    async function waitForElement() {
      while (true) {
        const tabElement = Array.from(
          document.querySelectorAll('a[role="tab"]')
        ).find((el) => el.textContent.trim() === CONFIG.TAB_NAME);

        if (tabElement) {
          return tabElement;
        }

        await new Promise((resolve) => setTimeout(resolve, CONFIG.WAIT_TIME)); // Attendre avant de réessayer
      }
    }

    // fonction pour attendre le chargement de l'étape active
    async function waitForActiveStep() {
      while (true) {
        const activeStep = document.querySelector("li.itemFrise.active");
        if (activeStep) return activeStep;
        await new Promise((resolve) => setTimeout(resolve, CONFIG.WAIT_TIME));
      }
    }

    const tabElement = await waitForElement();
    tabElement.click();

    // Obtenir les données du dossier directement
    const response = await fetch(CONFIG.API_ENDPOINT);
    if (!response.ok) throw new Error(`Erreur API: ${response.status}`);

    const dossierData = await response.json();
    if (!dossierData?.dossier?.statut) throw new Error("Statut non trouvé");

    const data = {
      dossier: dossierData.dossier,
    };

    // Récupérer l'ID du dossier
    const idDossier = dossierData.dossier.id;

    // Récupérer les données dossier (date d'entretien + décret) depuis l'API dossier
    let assimilationDate = null;
    let assimilationPlateforme = null;
    let decretId = null;
    let recepisseCreated = null;
    let complementInstructionDate = null;
    let demandeDate = null;
    try {
      const dossierResponse = await fetch(
        CONFIG.API_DOSSIER_ENDPOINT + idDossier
      );
      if (dossierResponse.ok) {
        const raw = await dossierResponse.json();
        const dossierDetails = raw?.data ?? raw;

        // Date de demande (consommation taxe)
        demandeDate = dossierDetails?.taxe_payee?.date_consommation || null;

        // entretien d'assimilation
        assimilationDate =
          dossierDetails?.entretien_assimilation?.date_rdv || null;
        assimilationPlateforme =
          dossierDetails?.entretien_assimilation?.unite_gestion?.nom_plateforme || null;
        // décret id (prendre le premier trouvé)

        const idents = dossierDetails?.demande?.informations?.etat_civil?.identites_decrets;
        if (Array.isArray(idents) && idents.length > 0) {
          for (const identite of idents) {
            if (identite?.decret?.id) {
              decretId = identite.decret.id;
              break;
            }
          }
        }
        // demande de complément d'instruction (prendre le dernier)
        const demandeComplements = dossierDetails?.demande_complement;
        if (Array.isArray(demandeComplements) && demandeComplements.length > 0) {
          const complementInstructions = demandeComplements.filter(
            (dc) => dc?.type_complement === "COMPLEMENT_INSTRUCTION"
          );
          if (complementInstructions.length > 0) {
            complementInstructionDate = complementInstructions.sort(
              (a, b) => new Date(b.date_creation_demande) - new Date(a.date_creation_demande)
            )[0]?.date_creation_demande;
          }
        }
      }
    } catch (e) {
      // Silently fail to avoid console exposure
    }

    // Fin récupération dossier

    // Fin récupération dossier (une seule requête)

    // Fonction pour valider si le statut est en clair
    function maybePlainStatus(statusValue) {
      if (typeof statusValue !== "string") return null;
      const trimmed = statusValue.trim();
      if (!trimmed) return null;
      return /^[a-z0-9_]+$/i.test(trimmed) ? trimmed.toLowerCase() : null;
    }

    function safeStatusDescription(status) {
      if (!status) return null;

      const map = {
        draft: "Dossier en brouillon",
        dossier_depose: "Dossier déposé",
        verification_formelle_a_traiter: "Préfecture : Vérification à traiter",
        verification_formelle_en_cours: "Préfecture : Vérification formelle en cours",
        verification_formelle_mise_en_demeure: "Préfecture : Vérification formelle, mise en demeure",
        instruction_a_affecter: "Préfecture : En attente affectation à un agent",
        instruction_recepisse_completude_a_envoyer: "Préfecture : récépissé de complétude à envoyer",
        instruction_recepisse_completude_a_envoyer_retour_complement_a_traiter: "Préfecture : Compléments à vérifier par l'agent",
        instruction_date_ea_a_fixer: "Préfecture : Date entretien à fixer",
        ea_demande_report_ea: "Préfecture : Demande de report entretien",
        ea_en_attente_ea: "Préfecture : Attente convocation entretien",
        ea_crea_a_valider: "Préfecture : Entretien passé, compte-rendu à valider",
        prop_decision_pref_a_effectuer: "Préfecture : Décision à effectuer",
        prop_decision_pref_en_attente_retour_hierarchique: "Préfecture : En attente retour hiérarchique",
        prop_decision_pref_prop_a_editer: "Préfecture : Décision prise, rédaction en cours",
        prop_decision_pref_en_attente_retour_signataire: "Préfecture : En attente retour signataire",
        controle_a_affecter: "SDANF : Dossier transmis, attente d'affectation",
        controle_a_effectuer: "SDANF : Contrôle état civil à effectuer",
        controle_en_attente_pec: "SCEC : Attente validation pièce d'état civil",
        controle_pec_a_faire: "SCEC : Validation en cours pièce d'état civil",
        controle_transmise_pour_decret: "SDANF : Décret transmis pour approbation",
        controle_en_attente_retour_hierarchique: "SDANF : Attente retour hiérarchique pour décret",
        controle_decision_a_editer: "SDANF : Décision hiérarchique prise, édition prochaine",
        controle_en_attente_signature: "SDANF : Décision prise, attente signature",
        transmis_a_ac: "Décret : Dossier transmis au service décret",
        a_verifier_avant_insertion_decret: "Décret : Vérification avant insertion décret",
        prete_pour_insertion_decret: "Décret : Dossier prêt pour insertion décret",
        inseree_dans_decret: "Décret : Demande insérée dans décret",
        decret_envoye_prefecture: "Décret envoyé à préfecture",
        notification_envoyee: "Décret : Notification envoyée au demandeur",
        demande_traitee: "Décret : Demande finalisée",
        decret_naturalisation_publie: "Décision : Décret de naturalisation publié",
        decret_en_preparation: "Décision : Décret en préparation",
        decret_a_qualifier: "Décision : Décret à qualifier",
        decret_en_validation: "Décision : Décret en validation",
        decision_negative_en_delais_recours: "Décision négative en délais de recours",
        irrecevabilite_manifeste: "Décision : irrecevabilité manifeste",
        irrecevabilite_manifeste_en_delais_recours: "Décision : irrecevabilité en délais de recours",
        decision_notifiee: "Décision notifiée",
        demande_en_cours_rapo: "Décision : Demande en cours RAPO",
        decret_publie: "Décret de naturalisation publié"
      };

      return map[status] || null;
    }

    function createStatusCard(dynamicAttr, title, subtitle, note, isGreen = false, extraContent = null) {
      const card = document.createElement("li");
      card.setAttribute(dynamicAttr, "");
      card.className = "itemFrise active ng-star-inserted " + (isGreen ? "anf-safe-card-green" : "anf-safe-card");
      
      if (isGreen) {
        card.style.background = "linear-gradient(165deg, #d4f4dd, #f0fff4)";
        card.style.border = "2px solid #10b981";
      } else {
        card.style.background = "linear-gradient(165deg, #dbe2e9, #ffffff)";
        card.style.border = "2px solid #255a99";
      }
      card.style.borderRadius = "8px";
      card.style.boxShadow = isGreen ? "inset 2px 2px 5px rgba(16, 185, 129, 0.2), 5px 5px 15px rgba(0, 0, 0, 0.3)" : "inset 2px 2px 5px rgba(0, 0, 0, 0.2), 5px 5px 15px rgba(0, 0, 0, 0.3)";

      const content = document.createElement("div");
      content.setAttribute(dynamicAttr, "");
      content.className = "itemFriseContent";
      content.style.position = "relative";

      const vSpan = document.createElement("span");
      vSpan.setAttribute(dynamicAttr, "");
      vSpan.style.cssText = "position: absolute; top: 1px; right: 3px; font-size: 8px; color: #aaa; opacity: 0.85;";
      vSpan.textContent = `v${extensionVersion}`;
      content.appendChild(vSpan);

      const iconWrap = document.createElement("span");
      iconWrap.setAttribute(dynamicAttr, "");
      iconWrap.className = "itemFriseIcon";
      const icon = document.createElement("span");
      icon.setAttribute(dynamicAttr, "");
      icon.setAttribute("aria-hidden", "true");
      icon.className = isGreen ? "fa fa-thumbs-up" : "fa fa-hourglass-start";
      icon.style.color = isGreen ? "#19a53c" : "#bf2626";
      iconWrap.appendChild(icon);
      content.appendChild(iconWrap);

      const p = document.createElement("p");
      p.setAttribute(dynamicAttr, "");
      p.textContent = title + " ";
      
      if (subtitle) {
        const subSpan = document.createElement("span");
        subSpan.style.color = "#bf2626";
        subSpan.textContent = subtitle;
        p.appendChild(subSpan);
      }
      content.appendChild(p);

      if (note) {
        const noteP = document.createElement("p");
        noteP.setAttribute(dynamicAttr, "");
        noteP.className = "anf-safe-note";
        noteP.style.fontSize = "10px";
        noteP.style.color = "#666";
        noteP.style.textAlign = "center";
        noteP.style.marginTop = "4px";
        noteP.textContent = note;
        content.appendChild(noteP);
      }

      if (extraContent) {
        content.appendChild(extraContent);
      }

      card.appendChild(content);
      return card;
    }

    const rawStatus = data.dossier.statut || null;
    const plainStatus = maybePlainStatus(rawStatus);
    const statusLabel = safeStatusDescription(plainStatus);
    const dateStatut = data.dossier.date_statut;

    const title = statusLabel || "Statut indisponible";
    const note = statusLabel
      ? (dateStatut ? `Depuis le ${formatDate(dateStatut)}` : null)
      : "Le statut retourné par l'API n'est pas exploitable localement dans cette version.";

    const dossierStatus = title;
    const dossierStatusCode = rawStatus || "Non disponible";

    // Fonction pour calculer le nombre de jours écoulés
    function daysAgo(dateString) {
      const inputDate = new Date(dateString);
      const currentDate = new Date();
      const diffInDays = Math.floor(
        (currentDate - inputDate) / (1000 * 60 * 60 * 24)
      );

      if (diffInDays === 0) {
        const hours = String(inputDate.getHours()).padStart(2, "0");
        const minutes = String(inputDate.getMinutes()).padStart(2, "0");
        return `Aujourd'hui à ${hours}h${minutes}`;
      }
      if (diffInDays === 1) {
        const hours = String(inputDate.getHours()).padStart(2, "0");
        const minutes = String(inputDate.getMinutes()).padStart(2, "0");
        return `Hier à ${hours}h${minutes}`;
      }
      if (diffInDays <= 30) return `il y a ${diffInDays} jrs`;

      const years = Math.floor(diffInDays / 365);
      const months = Math.floor((diffInDays % 365) / 30);
      const days = diffInDays % 30;

      if (years >= 1) {
        if (months === 0) {
          return `il y a ${years} ${years === 1 ? "an" : "ans"}`;
        }
        return `il y a ${years} ${
          years === 1 ? "an" : "ans"
        } et ${months} mois`;
      }

      if (months >= 1) {
        if (days === 0) {
          return `il y a ${months} ${months === 1 ? "mois" : "mois"}`;
        }
        return `il y a ${months} ${
          months === 1 ? "mois" : "mois"
        } et ${days} jrs`;
      }

      return `il y a ${months} mois`;
    }

    // Formatter la date au format DD/MM/YY HH24hMI
    function formatDate(dateString) {
      if (!dateString) return "";
      const d = new Date(dateString);
      if (isNaN(d)) return "";
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${dd}/${mm}/${yyyy}`; // ${hh}h${mi}`;
    }

    // Attendre l'élément actif au lieu de lancer une erreur s'il n'est pas trouvé
    const activeStep = await waitForActiveStep();

    // Trouver la classe CSS dynamique
    const dynamicClass = activeStep
      .getAttributeNames()
      .find((name) => name.startsWith("_ngcontent-"));

    // Ajouter la date de demande envoyée au libellé s'il existe
    async function addDemandeEnvoyeeDateIfPresent() {
      if (!demandeDate) return;
      const maxTries = 20;
      for (let i = 0; i < maxTries; i++) {
        const pEl = Array.from(document.querySelectorAll("p")).find(
          (el) =>
            el.textContent &&
            (el.textContent.trim().toLowerCase() === "demande envoyée" || el.textContent.trim().toLowerCase() === "dossier déposé")
        );
        if (pEl) {
          if (!pEl.querySelector(".anf-demande-date")) {
            const span = document.createElement("span");
            if (dynamicClass) span.setAttribute(dynamicClass, "");
            span.className = "anf-step-info anf-demande-date";
            
            const dateText = document.createTextNode(formatDate(demandeDate) + " ");
            span.appendChild(dateText);
            
            const secondarySpan = document.createElement("span");
            secondarySpan.className = "secondary-text";
            secondarySpan.textContent = `(${daysAgo(demandeDate)})`;
            span.appendChild(secondarySpan);
            
            pEl.appendChild(span);
          }
          break;
        }
        await new Promise((r) => setTimeout(r, CONFIG.WAIT_TIME));
      }
    }

    // Ajouter la date de demande de complément d'instruction au libellé s'il existe
    async function addComplementInstructionDateIfPresent() {
      if (!complementInstructionDate) return;
      const maxTries = 20;
      for (let i = 0; i < maxTries; i++) {
        const pEl = Array.from(document.querySelectorAll("p")).find(
          (el) =>
            el.textContent &&
            el.textContent.trim().toLowerCase() === "examen des pièces en cours"
        );
        if (pEl) {
          if (!pEl.querySelector(".anf-complement-date")) {
            const span = document.createElement("span");
            if (dynamicClass) span.setAttribute(dynamicClass, "");
            span.className = "anf-step-info anf-complement-date";
            span.textContent = `Complément demandé le ${formatDate(complementInstructionDate)}`;
            pEl.appendChild(document.createElement("br"));
            pEl.appendChild(span);
          }
          break;
        }
        await new Promise((r) => setTimeout(r, CONFIG.WAIT_TIME));
      }
    }

    // Ajouter la date d'entretien d'assimilation au libellé s'il existe
    async function addAssimilationDateIfPresent() {
      if (!assimilationDate) return;
      const maxTries = 20;
      for (let i = 0; i < maxTries; i++) {
        const pEl = Array.from(document.querySelectorAll("p")).find(
          (el) =>
            el.textContent &&
            el.textContent.trim().toLowerCase() === "entretien d'assimilation"
        );
        if (pEl) {
          if (!pEl.querySelector(".anf-assim-date")) {
            const span = document.createElement("span");
            if (dynamicClass) span.setAttribute(dynamicClass, "");
            span.className = "anf-step-info anf-assim-date";
            
            span.textContent = formatDate(assimilationDate);
            pEl.appendChild(span);

            if (assimilationPlateforme) {
              pEl.appendChild(document.createElement("br"));
              const pSpan = document.createElement("span");
              if (dynamicClass) pSpan.setAttribute(dynamicClass, "");
              pSpan.className = "anf-step-info";
              pSpan.style.marginTop = "4px";
              pSpan.style.cursor = "pointer";
              
              const tSpan = document.createElement("span");
              const hiddenText = "  " + "*".repeat(12);
              tSpan.textContent = hiddenText;
              pSpan.appendChild(tSpan);
              
              let hidden = true;
              pSpan.onclick = function(e){
                  e.stopPropagation();
                  hidden = !hidden;
                  if(hidden){
                      tSpan.textContent = hiddenText;
                  } else {
                      tSpan.textContent = "  " + assimilationPlateforme;
                  }
              };
              pEl.appendChild(pSpan);
            }
          }
          break;
        }
        await new Promise((r) => setTimeout(r, CONFIG.WAIT_TIME));
      }
    }

    // Ajouter la date de réception du récépissé de complétude au libellé s'il existe
    async function addRecepisseCompletuDateIfPresent() {
      if (!recepisseCreated) return;
      const maxTries = 20;
      for (let i = 0; i < maxTries; i++) {
        const pEl = Array.from(document.querySelectorAll("p")).find(
          (el) =>
            el.textContent &&
            el.textContent.trim().toLowerCase() ===
              "réception du récépissé de complétude"
        );
        if (pEl) {
          if (!pEl.querySelector(".anf-recepisse-date")) {
            const span = document.createElement("span");
            if (dynamicClass) span.setAttribute(dynamicClass, "");
            span.className = "anf-step-info anf-recepisse-date";
            span.textContent = formatDate(recepisseCreated);
            pEl.appendChild(span);
          }
          break;
        }
        await new Promise((r) => setTimeout(r, CONFIG.WAIT_TIME));
      }
    }

    // Ajouter la date du statut au step actif
    function addActiveStepDateTag() {
      const statutDate = data?.dossier?.date_statut;
      if (!activeStep || !statutDate) return;
      const p = activeStep.querySelector("p");
      if (!p) return;
      if (p.querySelector(".anf-active-date")) return;
      const span = document.createElement("span");
      if (dynamicClass) span.setAttribute(dynamicClass, "");
      span.className = "anf-step-info anf-active-date";
      span.textContent = formatDate(statutDate);
      p.appendChild(span);
    }

    // Création du nouvel élément avec le style et le format spécifiés
    const popup = document.createElement("div");
    popup.setAttribute(dynamicClass, "");
    popup.className = "anf-code-popup";
    popup.textContent = `${dossierStatusCode} depuis le ${formatDate(data?.dossier?.date_statut)}`;

    const subtitle = `(${daysAgo(data?.dossier?.date_statut)})`;
    const newElement = createStatusCard(dynamicClass, title, subtitle, note, false, popup);

    activeStep.parentNode.insertBefore(newElement, activeStep.nextSibling);

    // Ajouter une étape pour le décret si disponible
    if (decretId) {
      const dTitle = "Décret de Naturalisation ";
      const dSubtitle = `N° ${decretId}`;
      
      const linkWrap = document.createElement("div");
      linkWrap.setAttribute(dynamicClass, "");

      const dLink = document.createElement("a");
      dLink.href = "https://www.legifrance.gouv.fr/search/all?tab_selection=all&searchField=ALL&query=nationalit%C3%A9+fran%C3%A7aise&page=1&init=true";
      dLink.target = "_blank";
      dLink.style.cssText = "color: #255a99; text-decoration: none; font-size: 11px;";
      
      const lIcon = document.createElement("i");
      lIcon.className = "fa fa-search";
      lIcon.setAttribute("aria-hidden", "true");
      dLink.appendChild(lIcon);
      dLink.appendChild(document.createTextNode(" LégiFrance"));
      linkWrap.appendChild(dLink);

      const dElement = createStatusCard(dynamicClass, dTitle, dSubtitle, null, true, linkWrap);
      dElement.style.marginLeft = "20px";
      
      newElement.parentNode.insertBefore(dElement, newElement.nextSibling);
    }

    // Fonction pour masquer/afficher le numéro de série
    async function addSeriesVisibilityToggle() {
      const maxTries = 20;
      for (let i = 0; i < maxTries; i++) {
        const tds = Array.from(document.querySelectorAll('td.fixed'));
        const seriesTd = tds.find(td => /^\d{4}X\s\d+$/.test(td.textContent.trim()));

        if (seriesTd) {
            if (seriesTd.querySelector('.anf-toggle-serie')) return;

            const fullSerie = seriesTd.textContent.trim();
            const parts = fullSerie.split(' ');
            if (parts.length !== 2) return;

            const prefix = parts[0];
            const suffix = parts[1];
            const maskedSuffix = '*'.repeat(suffix.length);
            
            let isHidden = true;

            seriesTd.textContent = '';
            
            const textSpan = document.createElement('span');
            textSpan.textContent = `${prefix} ${maskedSuffix}`;
            seriesTd.appendChild(textSpan);

            const icon = document.createElement('i');
            icon.className = 'fa fa-eye-slash anf-toggle-serie';
            icon.style.marginLeft = '8px';
            icon.style.cursor = 'pointer';
            icon.style.color = '#255a99';
            
            icon.onclick = function(e) {
                e.stopPropagation();
                isHidden = !isHidden;
                if (isHidden) {
                    textSpan.textContent = `${prefix} ${maskedSuffix}`;
                    icon.className = 'fa fa-eye-slash anf-toggle-serie';
                } else {
                    textSpan.textContent = `${prefix} ${suffix}`;
                    icon.className = 'fa fa-eye anf-toggle-serie';
                }
            };

            seriesTd.appendChild(icon);
            break;
        }
        await new Promise((r) => setTimeout(r, CONFIG.WAIT_TIME));
      }
    }

    // Fonction pour masquer/afficher le numéro de timbre fiscal
    async function addFiscalStampVisibilityToggle() {
      const maxTries = 20;
      for (let i = 0; i < maxTries; i++) {
        const tds = Array.from(document.querySelectorAll('td.fixed'));
        // Fiscal stamp is usually a 16 digit number
        const fiscalTd = tds.find(td => /^\d{16}$/.test(td.textContent.trim()));

        if (fiscalTd) {
            if (fiscalTd.querySelector('.anf-toggle-fiscal')) return;

            const fullStamp = fiscalTd.textContent.trim();
            const maskedStamp = '*'.repeat(fullStamp.length);
            
            let isHidden = true;

            fiscalTd.textContent = '';
            
            const textSpan = document.createElement('span');
            textSpan.textContent = maskedStamp;
            fiscalTd.appendChild(textSpan);

            const icon = document.createElement('i');
            icon.className = 'fa fa-eye-slash anf-toggle-fiscal';
            icon.style.marginLeft = '8px';
            icon.style.cursor = 'pointer';
            icon.style.color = '#255a99';
            
            icon.onclick = function(e) {
                e.stopPropagation();
                isHidden = !isHidden;
                if (isHidden) {
                    textSpan.textContent = maskedStamp;
                    icon.className = 'fa fa-eye-slash anf-toggle-fiscal';
                } else {
                    textSpan.textContent = fullStamp;
                    icon.className = 'fa fa-eye anf-toggle-fiscal';
                }
            };

            fiscalTd.appendChild(icon);
            break;
        }
        await new Promise((r) => setTimeout(r, CONFIG.WAIT_TIME));
      }
    }

    // Ajouter la date de demande envoyée si disponible
    addDemandeEnvoyeeDateIfPresent();
    // Ajouter la date de demande de complément d'instruction si disponible
    addComplementInstructionDateIfPresent();
    // Ajouter la date d'entretien d'assimilation si disponible
    addAssimilationDateIfPresent();
    // Ajouter la date de récépissé de complétude si disponible
    addRecepisseCompletuDateIfPresent();
    // Ajouter la date au step actif
    addActiveStepDateTag();
    // Ajouter le toggle pour le numéro de série
    addSeriesVisibilityToggle();
    // Ajouter le toggle pour le numéro de timbre fiscal
    addFiscalStampVisibilityToggle();
  } catch (error) {
    console.log(
      "Extension API Naturalisation : Erreur d'initialisation:",
      error
    );
  }
})();