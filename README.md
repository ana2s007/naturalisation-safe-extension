Extension Chrome nettoyée pour usage en mode développeur.

Contenu:
- manifest.json
- inject.js

Ce qui reste:
- lecture des APIs déjà accessibles dans la session connectée
- affichage des dates utiles
- affichage du décret si présent
- masquage visuel du numéro de série et du timbre fiscal
- affichage du statut seulement si l'API le renvoie déjà en clair

Fonctionnement et Sécurité:
- Navigation Automatique : Oriente l'usager vers le bon onglet de demande de nationalité.
- Lecture des APIs Internes : Récupère les données depuis les APIs de l'administration sans stockage de vos identifiants.
- Carte de Statut Enrichie : Affiche le libellé du statut (ex: "Dossier déposé"), la date de mise à jour et le temps écoulé (ex: "il y a 5 jours").
- Respect de la Vie Privée : Pas d'envoi de données vers des serveurs tiers. Tout le traitement est local.
- Mode Lecture Seule : L'extension ne modifie pas votre dossier, elle améliore uniquement l'affichage des informations.

Installation:
1. Dézipper l'archive
2. Ouvrir chrome://extensions
3. Activer le mode développeur
4. Cliquer sur "Charger l'extension non empaquetée"
5. Sélectionner le dossier extrait
