document.addEventListener("DOMContentLoaded", function () {
  const mainContent = document.querySelector("main"); // Target the main element
  const progressContainer = document.querySelector(".progress-container"); // Keep the progress bar

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
      document.title = data.tripTitle; // Update page title

      // Clear existing hardcoded content in main, except progress bar
      mainContent.innerHTML = "";
      if (progressContainer) {
        mainContent.appendChild(progressContainer); // Re-append progress bar
      }

      // --- Dynamically generate itinerary ---
      data.weeks.forEach((week) => {
        const weekContainer = document.createElement("div");
        weekContainer.classList.add("week-container");
        weekContainer.id = week.id;

        const weekHeaderDiv = document.createElement("div");
        weekHeaderDiv.classList.add("week-header");
        weekHeaderDiv.textContent = week.weekHeader;
        weekContainer.appendChild(weekHeaderDiv);

        week.days.forEach((day) => {
          const dayContainer = document.createElement("div");
          dayContainer.classList.add("day-container");
          dayContainer.id = day.id;

          const dayHeaderDiv = document.createElement("div");
          dayHeaderDiv.classList.add("day-header");

          const dayNameSpan = document.createElement("span");
          dayNameSpan.textContent = day.dayName;
          dayHeaderDiv.appendChild(dayNameSpan);

          const dayDateSpan = document.createElement("span");
          dayDateSpan.classList.add("day-date");
          dayDateSpan.textContent = `Day ${day.dayNumber}`;
          dayHeaderDiv.appendChild(dayDateSpan);

          dayContainer.appendChild(dayHeaderDiv);

          day.events.forEach((event) => {
            const eventDiv = document.createElement("div");
            eventDiv.classList.add("event", event.type); // Use type for class

            if (event.time) {
              const timeDiv = document.createElement("div");
              timeDiv.classList.add("event-time");
              timeDiv.textContent = event.time;
              eventDiv.appendChild(timeDiv);
            }

            const descriptionDiv = document.createElement("div");
            descriptionDiv.textContent = event.description;
            eventDiv.appendChild(descriptionDiv);

            if (event.details) {
              const detailsDiv = document.createElement("div");
              detailsDiv.textContent = event.details;
              eventDiv.appendChild(detailsDiv);
            }

            if (event.location) {
              const locationDiv = document.createElement("div");
              locationDiv.classList.add("location");
              // Handle potential multi-line locations from HTML parsing
              locationDiv.innerHTML = event.location.replace(/\n\s*/g, "<br>");
              eventDiv.appendChild(locationDiv);
            }

            dayContainer.appendChild(eventDiv);
          });

          weekContainer.appendChild(dayContainer);
        });

        // Insert the week container before the progress bar
        if (progressContainer) {
          mainContent.insertBefore(weekContainer, progressContainer);
        } else {
          mainContent.appendChild(weekContainer); // Fallback if progress bar wasn't found
        }
      });

      // --- Trip progress calculation (needs adjustment for date parsing) ---
      // Extract start and end dates from the tripDates string
      const dateParts = data.tripDates.split(" - ");
      const startDateString = dateParts[0]; // e.g., "April 7"
      const endDateString = dateParts[1]; // e.g., "May 13, 2025"

      // Extract year from the end date string
      const year = endDateString.split(", ")[1];

      // Construct full date strings
      const tripStartDate = new Date(`${startDateString}, ${year}`);
      const tripEndDate = new Date(endDateString);

      function updateTripProgress() {
        const today = new Date();
        const todayDateOnly = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        ); // Ignore time part for comparison

        // Format date for ID matching (YYYY-MM-DD)
        const yearStr = today.getFullYear();
        const monthStr = String(today.getMonth() + 1).padStart(2, "0"); // Month is 0-indexed
        const dayStr = String(today.getDate()).padStart(2, "0");
        const formattedDate = `${yearStr}-${monthStr}-${dayStr}`;
        const dayId = `day-${formattedDate}`;

        // Find today's container
        const todayContainer = document.getElementById(dayId);

        // Calculate trip progress
        let progress = 0;
        let statusText = "";

        if (todayDateOnly < tripStartDate) {
          // Trip hasn't started yet
          progress = 0;
          const daysToStart = Math.ceil(
            (tripStartDate - todayDateOnly) / (1000 * 60 * 60 * 24)
          );
          statusText = `Trip starts in ${daysToStart} day${
            daysToStart !== 1 ? "s" : ""
          }`;
        } else if (todayDateOnly > tripEndDate) {
          // Trip is over
          progress = 100;
          statusText = "Trip completed";
        } else {
          // Trip is in progress
          const totalDuration = tripEndDate - tripStartDate;
          const elapsed = todayDateOnly - tripStartDate;
          progress = Math.min(100, Math.round((elapsed / totalDuration) * 100));

          // Calculate total days in the trip for display
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

          // Highlight today's container if it exists
          if (todayContainer) {
            todayContainer.classList.add("current-day");

            // Scroll to today's container
            setTimeout(() => {
              todayContainer.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }, 500);
          }
        }

        // Update progress bar elements (ensure they exist after clearing main)
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

      // Initialize progress
      updateTripProgress();

      // Update progress every minute
      setInterval(updateTripProgress, 60000);
    })
    .catch((error) => {
      console.error("Error loading or processing travel data:", error);
      // Display error message to the user
      const errorDiv = document.createElement("div");
      errorDiv.textContent =
        "Failed to load travel itinerary. Please check the console for details.";
      errorDiv.style.color = "red";
      errorDiv.style.padding = "20px";
      mainContent.insertBefore(errorDiv, progressContainer); // Insert error before progress bar
    });
});
