document.addEventListener("DOMContentLoaded", function () {
  const mainContent = document.querySelector("main");
  const progressContainer = document.querySelector(".progress-container");

  // --- Helper function to format location details ---
  function formatLocation(location) {
    if (!location) return "";
    let locationText = location.name || "";
    if (location.address) locationText += `, ${location.address}`;
    if (location.country) locationText += `, ${location.country}`;
    if (location.details) locationText += ` (${location.details})`;
    return locationText.replace(/\n\s*/g, "<br>");
  }

  // --- Helper function to toggle collapse state ---
  function toggleCollapse(element) {
    element.classList.toggle("collapsed");
    element.classList.toggle("expanded");
  }

  fetch("data/travel.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      // Set header details
      document.querySelector("header h1").textContent = data.tripTitle;
      document.querySelector("header p").textContent = data.tripDates;
      document.title = data.tripTitle;

      // Clear existing content in main, except progress bar
      mainContent.innerHTML = "";
      if (progressContainer) {
        mainContent.appendChild(progressContainer); // Re-append progress bar
      }

      // --- Data Lookups ---
      const locations = data.locations || {};
      const accommodations = data.accommodations || {};
      const events = data.events || {};
      const days = data.days || {};
      const weeks = data.weeks || []; // Use the weeks array directly

      // --- Get today's date (ignoring time) ---
      const today = new Date();
      const todayDateOnly = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      let isCurrentWeek = false; // Flag to track if we've passed the current week

      // --- Dynamically generate itinerary using FULLY normalized data ---
      weeks.forEach((weekData) => {
        const weekContainer = document.createElement("div");
        weekContainer.classList.add("week-container", "collapsible"); // Add base classes
        weekContainer.id = weekData.id;

        const weekHeaderDiv = document.createElement("div");
        weekHeaderDiv.classList.add("week-header", "collapsible-header");
        weekHeaderDiv.textContent = weekData.weekHeader;
        weekHeaderDiv.addEventListener("click", () =>
          toggleCollapse(weekContainer)
        ); // Add toggle click
        weekContainer.appendChild(weekHeaderDiv);

        const weekContentDiv = document.createElement("div"); // Container for days
        weekContentDiv.classList.add("collapsible-content");
        weekContainer.appendChild(weekContentDiv);

        let weekHasPassed = true; // Assume week has passed unless a future day is found

        (weekData.dayRefs || []).forEach((dayRef) => {
          const dayData = days[dayRef];
          if (!dayData) return; // Skip if day reference is invalid

          const dayContainer = document.createElement("div");
          dayContainer.classList.add("day-container", "collapsible"); // Add base classes
          dayContainer.id = dayRef; // Use dayRef as ID

          const dayHeaderDiv = document.createElement("div");
          dayHeaderDiv.classList.add("day-header", "collapsible-header");
          dayHeaderDiv.addEventListener("click", () =>
            toggleCollapse(dayContainer)
          ); // Add toggle click

          const dayNameSpan = document.createElement("span");
          dayNameSpan.textContent = dayData.dayName;
          dayHeaderDiv.appendChild(dayNameSpan);

          const dayDateSpan = document.createElement("span");
          dayDateSpan.classList.add("day-date");
          dayDateSpan.textContent = `Day ${dayData.dayNumber}`;
          dayHeaderDiv.appendChild(dayDateSpan);

          dayContainer.appendChild(dayHeaderDiv);

          const dayContentDiv = document.createElement("div"); // Container for events
          dayContentDiv.classList.add("collapsible-content");
          dayContainer.appendChild(dayContentDiv);

          (dayData.eventRefs || []).forEach((eventRef) => {
            const eventData = events[eventRef];
            if (!eventData) return; // Skip if event reference is invalid

            const eventDiv = document.createElement("div");
            eventDiv.classList.add("event", eventData.type);

            if (eventData.time) {
              const timeDiv = document.createElement("div");
              timeDiv.classList.add("event-time");
              timeDiv.textContent = eventData.time;
              eventDiv.appendChild(timeDiv);
            }

            // Handle Accommodation Events
            if (eventData.accommodationRef) {
              const accommodation = accommodations[eventData.accommodationRef];
              if (accommodation) {
                const descriptionDiv = document.createElement("div");
                descriptionDiv.textContent = `${eventData.time || ""} ${
                  accommodation.name
                }`.trim();
                eventDiv.appendChild(descriptionDiv);

                if (accommodation.locationRef) {
                  const location = locations[accommodation.locationRef];
                  if (location) {
                    const locationDiv = document.createElement("div");
                    locationDiv.classList.add("location");
                    locationDiv.innerHTML = formatLocation(location);
                    eventDiv.appendChild(locationDiv);
                  }
                }
              } else {
                const descriptionDiv = document.createElement("div");
                descriptionDiv.textContent =
                  eventData.description || "Accommodation details missing";
                eventDiv.appendChild(descriptionDiv);
              }
            }
            // Handle other events
            else {
              const descriptionDiv = document.createElement("div");
              descriptionDiv.textContent =
                eventData.description || "Event details missing";
              eventDiv.appendChild(descriptionDiv);

              if (eventData.details) {
                const detailsDiv = document.createElement("div");
                detailsDiv.textContent = eventData.details;
                eventDiv.appendChild(detailsDiv);
              }

              if (eventData.locationRef) {
                const location = locations[eventData.locationRef];
                if (location) {
                  const locationDiv = document.createElement("div");
                  locationDiv.classList.add("location");
                  locationDiv.innerHTML = formatLocation(location);
                  eventDiv.appendChild(locationDiv);
                }
              }
            }
            dayContentDiv.appendChild(eventDiv); // Add event to day's content
          });

          // --- Default Collapse Logic for Days ---
          const dayDate = new Date(dayData.date + "T00:00:00"); // Ensure correct date parsing
          if (dayDate < todayDateOnly) {
            dayContainer.classList.add("collapsed");
          } else {
            dayContainer.classList.add("expanded");
            weekHasPassed = false; // Found a current or future day in this week
            if (dayDate.getTime() === todayDateOnly.getTime()) {
              dayContainer.classList.add("current-day"); // Highlight today
              isCurrentWeek = true; // Mark this week as current
            }
          }

          weekContentDiv.appendChild(dayContainer); // Add day to week's content
        });

        // --- Default Collapse Logic for Weeks ---
        if (weekHasPassed && !isCurrentWeek) {
          weekContainer.classList.add("collapsed");
        } else {
          weekContainer.classList.add("expanded");
        }
        // Reset for next week check if needed (though linear processing makes this less critical)
        if (isCurrentWeek && !weekHasPassed) {
          // If this was the current week, subsequent weeks should start expanded
          // unless explicitly collapsed later (e.g., if all their days are past)
          // This logic might need refinement based on exact desired behavior for future weeks.
          // For now, keep future weeks expanded by default.
        }

        // Insert the week container before the progress bar
        if (progressContainer) {
          mainContent.insertBefore(weekContainer, progressContainer);
        } else {
          mainContent.appendChild(weekContainer);
        }
      });

      // --- Trip progress calculation (remains the same) ---
      const dateParts = data.tripDates.split(" - ");
      const startDateString = dateParts[0];
      const endDateString = dateParts[1];
      const year = endDateString.split(", ")[1];
      const tripStartDate = new Date(`${startDateString}, ${year}`);
      const tripEndDate = new Date(endDateString);

      function updateTripProgress() {
        // ... (progress calculation logic remains unchanged) ...
        const today = new Date();
        const todayDateOnly = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );

        // Find today's container ID (using the date from dayData)
        let todayDayId = null;
        for (const dayId in days) {
          const dayData = days[dayId];
          const dayDate = new Date(dayData.date + "T00:00:00");
          if (dayDate.getTime() === todayDateOnly.getTime()) {
            todayDayId = dayId;
            break;
          }
        }

        const todayContainer = todayDayId
          ? document.getElementById(todayDayId)
          : null;

        let progress = 0;
        let statusText = "";

        if (todayDateOnly < tripStartDate) {
          progress = 0;
          const daysToStart = Math.ceil(
            (tripStartDate - todayDateOnly) / (1000 * 60 * 60 * 24)
          );
          statusText = `Trip starts in ${daysToStart} day${
            daysToStart !== 1 ? "s" : ""
          }`;
        } else if (todayDateOnly > tripEndDate) {
          progress = 100;
          statusText = "Trip completed";
        } else {
          const totalDuration = tripEndDate - tripStartDate;
          const elapsed = todayDateOnly - tripStartDate;
          progress = Math.min(100, Math.round((elapsed / totalDuration) * 100));

          const totalTripDays =
            Math.ceil((tripEndDate - tripStartDate) / (1000 * 60 * 60 * 24)) +
            1;
          const tripDay = Math.ceil(elapsed / (1000 * 60 * 60 * 24)) + 1;
          const daysLeft = Math.ceil(
            (tripEndDate - todayDateOnly) / (1000 * 60 * 60 * 24)
          );
          statusText = `Day ${tripDay} of ${totalTripDays} (${daysLeft} day${
            daysLeft !== 1 ? "s" : ""
          } remaining)`;

          // Highlight and scroll (if found)
          if (todayContainer) {
            // Ensure current day and its week are expanded
            todayContainer.classList.remove("collapsed");
            todayContainer.classList.add("expanded", "current-day");
            const parentWeek = todayContainer.closest(".week-container");
            if (parentWeek) {
              parentWeek.classList.remove("collapsed");
              parentWeek.classList.add("expanded");
            }

            // Scroll to today's container (check if already scrolled)
            // Basic check to avoid repeated scrolling
            if (!todayContainer.dataset.scrolled) {
              setTimeout(() => {
                todayContainer.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
                todayContainer.dataset.scrolled = "true"; // Mark as scrolled
              }, 500);
            }
          }
        }

        const progressFill = document.getElementById("trip-progress");
        const progressText = document.getElementById("progress-text");

        if (progressFill && progressText) {
          progressFill.style.width = `${progress}%`;
          progressText.textContent = statusText;
        } else {
          console.warn(
            "Progress bar elements not found after dynamic content load."
          );
        }
      }

      updateTripProgress();
      setInterval(updateTripProgress, 60000); // Update progress every minute
    })
    .catch((error) => {
      console.error("Error loading or processing travel data:", error);
      const errorDiv = document.createElement("div");
      errorDiv.textContent =
        "Failed to load travel itinerary. Please check the console for details.";
      errorDiv.style.color = "red";
      errorDiv.style.padding = "20px";
      mainContent.insertBefore(errorDiv, progressContainer);
    });
});
