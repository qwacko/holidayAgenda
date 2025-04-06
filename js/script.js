document.addEventListener("DOMContentLoaded", function () {
  const mainContent = document.querySelector("main");
  const progressContainer = document.querySelector(".progress-container");

  // --- Date Utilities ---
  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function formatDate(date) {
    // YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(dateString) {
    // YYYY-MM-DD
    if (!dateString) return null;
    const parts = dateString.split("-");
    // Note: Month is 0-indexed in JS Date constructor
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function getDayName(date) {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

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

  // --- NEW: Helper to determine if an activity is generic exploration ---
  function isGenericExploreActivity(description, dayLocationTitle) {
    if (!description || !dayLocationTitle) return false;
    // Simple check: Does the description largely match the day's location title?
    // e.g., "Explore Fresno Area" vs "Fresno Area"
    // e.g., "Washington DC" vs "Washington DC Area"
    const cleanedDesc = description
      .replace(/^Explore\s+/i, "")
      .replace(/\s+Area$/i, "")
      .trim(); // Remove "Explore " prefix and " Area" suffix
    const cleanedTitle = dayLocationTitle.replace(/\s+Area$/i, "").trim(); // Remove " Area" suffix
    // Check if they are reasonably similar (case-insensitive)
    return cleanedDesc.toLowerCase() === cleanedTitle.toLowerCase();
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

      // Clear existing itinerary content in main, preserving the progress bar
      if (progressContainer) {
        // Find all direct children of mainContent EXCEPT the progressContainer
        const childrenToRemove = Array.from(mainContent.children).filter(
          (child) => child !== progressContainer
        );
        // Remove them
        childrenToRemove.forEach((child) => mainContent.removeChild(child));
      } else {
        // If progress bar wasn't found (shouldn't happen with current HTML), clear everything
        mainContent.innerHTML = "";
      }

      // --- Data Lookups ---
      const locations = data.locations || {};
      const accommodations = data.accommodations || [];
      const cruises = data.cruises || [];
      const events = data.events || [];
      const weeks = data.weeks || [];

      // --- Get overall trip date range (Robust Parsing) ---
      let tripStartDate = null;
      let tripEndDate = null;
      try {
        const dateParts = data.tripDates.split(" - "); // e.g., ["April 7", "May 13, 2025"]
        const startDateStr = dateParts[0]; // e.g., "April 7"
        const endDateStr = dateParts[1]; // e.g., "May 13, 2025"
        const year = parseInt(endDateStr.split(", ")[1], 10); // Extract year

        const months = {
          January: 0,
          February: 1,
          March: 2,
          April: 3,
          May: 4,
          June: 5,
          July: 6,
          August: 7,
          September: 8,
          October: 9,
          November: 10,
          December: 11,
        };

        const startMonthName = startDateStr.split(" ")[0];
        const startDay = parseInt(startDateStr.split(" ")[1], 10);
        const startMonth = months[startMonthName];

        const endMonthName = endDateStr.split(" ")[0];
        const endDay = parseInt(endDateStr.split(",")[0].split(" ")[1], 10); // Handle comma
        const endMonth = months[endMonthName];

        if (
          isNaN(year) ||
          startMonth === undefined ||
          isNaN(startDay) ||
          endMonth === undefined ||
          isNaN(endDay)
        ) {
          throw new Error(
            "Could not parse date components from tripDates string."
          );
        }
        // Use local Date objects for the loop iteration
        tripStartDate = new Date(year, startMonth, startDay);
        tripEndDate = new Date(year, endMonth, endDay);

        if (isNaN(tripStartDate.getTime()) || isNaN(tripEndDate.getTime())) {
          throw new Error("Parsed dates resulted in Invalid Date.");
        }
        // Store UTC versions for progress calculation
        data.tripStartDateUTC = new Date(
          Date.UTC(year, startMonth, startDay, 12, 0, 0)
        );
        data.tripEndDateUTC = new Date(
          Date.UTC(year, endMonth, endDay, 12, 0, 0)
        );
      } catch (e) {
        console.error(
          "FATAL: Error parsing trip start/end dates for itinerary generation:",
          data.tripDates,
          e
        );
        mainContent.innerHTML = `<div style="color: red; padding: 20px;">Error: Could not determine trip dates. Cannot display itinerary.</div>`;
        return; // Stop execution
      }

      // --- Get today's date (ignoring time) ---
      const today = new Date();
      const todayDateOnly = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      let currentDayNumber = 0; // Track overall day number

      // --- Group data by date (Pre-computation step 1) ---
      const itineraryByDate = {};
      for (
        let d = new Date(tripStartDate);
        d <= tripEndDate;
        d = addDays(d, 1)
      ) {
        const dateStr = formatDate(d);
        itineraryByDate[dateStr] = []; // Initialize each day
      }

      // Process Accommodations into itineraryByDate
      accommodations.forEach((acc) => {
        const start = parseDate(acc.startDate);
        const end = parseDate(acc.endDate);
        if (!start || !end) return;
        const checkInDateStr = formatDate(start);
        const checkOutDateStr = formatDate(end);
        if (itineraryByDate[checkInDateStr]) {
          itineraryByDate[checkInDateStr].push({
            ...acc,
            eventType: "accommodation-check-in",
          });
        }
        if (itineraryByDate[checkOutDateStr]) {
          itineraryByDate[checkOutDateStr].push({
            ...acc,
            eventType: "accommodation-check-out",
          });
        }
      });

      // Process Cruises into itineraryByDate
      cruises.forEach((cruise) => {
        const start = parseDate(cruise.startDate);
        const end = parseDate(cruise.endDate);
        if (!start || !end) return;
        const embarkDateStr = formatDate(start);
        const disembarkDateStr = formatDate(end);
        if (itineraryByDate[embarkDateStr]) {
          itineraryByDate[embarkDateStr].push({
            ...cruise,
            eventType: "cruise-embark",
          });
        }
        if (itineraryByDate[disembarkDateStr]) {
          itineraryByDate[disembarkDateStr].push({
            ...cruise,
            eventType: "cruise-disembark",
          });
        }
        // Port Calls & Sea Days
        let currentDate = addDays(start, 1);
        const endDateCruise = new Date(end);
        while (currentDate < endDateCruise) {
          const currentDateStr = formatDate(currentDate);
          if (itineraryByDate[currentDateStr]) {
            const portCall = (cruise.portCalls || []).find(
              (pc) => pc.date === currentDateStr
            );
            if (portCall) {
              itineraryByDate[currentDateStr].push({
                ...cruise,
                ...portCall,
                eventType: "cruise-port-call",
              });
            } else {
              itineraryByDate[currentDateStr].push({
                ...cruise,
                eventType: "cruise-sea-day",
              });
            }
          }
          currentDate = addDays(currentDate, 1);
        }
      });

      // Process Events into itineraryByDate
      events.forEach((event) => {
        if (event.date) {
          // Single day event
          const dateStr = event.date;
          if (itineraryByDate[dateStr]) {
            itineraryByDate[dateStr].push({ ...event, eventType: event.type });
          }
        } else if (event.startDate && event.endDate) {
          // Multi-day event
          let current = parseDate(event.startDate);
          const end = parseDate(event.endDate);
          if (!current || !end) return;
          while (current <= end) {
            const dateStr = formatDate(current);
            if (itineraryByDate[dateStr]) {
              let multiDayStatus =
                formatDate(current) === event.startDate
                  ? " (Start)"
                  : formatDate(current) === event.endDate
                  ? " (End)"
                  : "";
              itineraryByDate[dateStr].push({
                ...event,
                eventType: event.type,
                multiDayDescription: `${event.description}${multiDayStatus}`,
              });
            }
            current = addDays(current, 1);
          }
        }
      });

      // --- NEW: Pre-process data to determine daily status and accommodation (Pre-computation step 2) ---
      const dailyInfoByDate = {};
      let currentAccommodation = null;
      let currentCruise = null;

      for (
        let d = new Date(tripStartDate);
        d <= tripEndDate;
        d = addDays(d, 1)
      ) {
        const dateStr = formatDate(d);
        const dayItems = itineraryByDate[dateStr] || []; // Use pre-grouped items

        let dayTitle = "Location Unknown"; // Default title
        let stayingAt = null; // Name of accommodation if staying overnight
        let onCruise = null; // Name of cruise ship if on cruise
        let isTravelDay = false;
        let isCruiseDay = false; // Specifically embark/disembark/port call day

        // --- Determine Status Logic ---
        // 1. Check for Check-out / Cruise Disembark first
        const checkOut = dayItems.find(
          (item) => item.eventType === "accommodation-check-out"
        );
        const cruiseDisembark = dayItems.find(
          (item) => item.eventType === "cruise-disembark"
        );
        if (checkOut) {
          const loc = locations[checkOut.locationRef];
          dayTitle = `Departure from ${loc?.name || checkOut.name}`;
          currentAccommodation = null;
          isTravelDay = true;
        }
        if (cruiseDisembark) {
          const loc = locations[cruiseDisembark.arrivalPortRef];
          dayTitle = `Cruise Arrival: ${loc?.name || "Port"}`;
          currentCruise = null;
          isTravelDay = true;
        }

        // 2. Check for ongoing Cruise status (if not disembarking today)
        if (!cruiseDisembark) {
          const activeCruise = cruises.find((c) => {
            const start = parseDate(c.startDate);
            const end = parseDate(c.endDate);
            return start && end && d >= start && d < end;
          });
          if (activeCruise) {
            currentCruise = activeCruise;
            isCruiseDay = true;
            const portCall = (activeCruise.portCalls || []).find(
              (pc) => pc.date === dateStr
            );
            if (portCall) {
              const portLoc = locations[portCall.locationRef];
              dayTitle = `Port Call: ${portLoc?.name || "Unknown Port"}`;
            } else {
              dayTitle = `At Sea (${activeCruise.shipName})`;
            }
            onCruise = activeCruise.shipName;
          } else {
            currentCruise = null;
          }
        }

        // 3. Check for ongoing Accommodation status (if not checking out today and not on cruise)
        if (!checkOut && !isCruiseDay) {
          const activeAccommodation = accommodations.find((acc) => {
            const start = parseDate(acc.startDate);
            const end = parseDate(acc.endDate);
            return start && end && d >= start && d < end;
          });
          if (activeAccommodation) {
            currentAccommodation = activeAccommodation;
            const loc = locations[activeAccommodation.locationRef];
            dayTitle = loc?.name || activeAccommodation.name;
            stayingAt = activeAccommodation.name;
          } else {
            currentAccommodation = null; // Explicitly clear if between stays
          }
        } else if (!isCruiseDay && !checkOut) {
          // Only clear if not checking out today
          currentAccommodation = null;
        } else if (isCruiseDay) {
          // If on cruise, definitely not in hotel
          currentAccommodation = null;
        }

        // 4. Check for Check-in / Cruise Embark (overrides title)
        const checkIn = dayItems.find(
          (item) => item.eventType === "accommodation-check-in"
        );
        const cruiseEmbark = dayItems.find(
          (item) => item.eventType === "cruise-embark"
        );
        if (checkIn) {
          const loc = locations[checkIn.locationRef];
          dayTitle = `Arrival in ${loc?.name || checkIn.name}`;
          // Find the actual accommodation object to set for the *next* day's check
          currentAccommodation =
            accommodations.find((a) => a.id === checkIn.id) || null;
          stayingAt = null; // Don't show "staying at" on check-in day itself
          isTravelDay = true;
        }
        if (cruiseEmbark) {
          const loc = locations[cruiseEmbark.departurePortRef];
          dayTitle = `Cruise Departure: ${loc?.name || "Port"}`;
          currentCruise = cruises.find((c) => c.id === cruiseEmbark.id) || null;
          currentAccommodation = null; // Assume check out before cruise
          stayingAt = null;
          isTravelDay = true;
          isCruiseDay = true; // Mark as a cruise event day
          onCruise = null; // Don't show "staying on" indicator on embark day itself
        }

        // 5. Check for Flights (marks as travel day, potentially overrides title)
        const flight = dayItems.find((item) => item.eventType === "flight");
        if (flight) {
          isTravelDay = true;
          if (flight.details) {
            const parts = flight.details.split(" to ");
            dayTitle =
              parts.length === 2
                ? `Travel: ${parts[0]} → ${parts[1]}`
                : "Travel Day (Flight)";
          } else {
            dayTitle = "Travel Day (Flight)";
          }
          // If flying, clear accommodation status unless checking in same day after flight
          if (!checkIn) {
            currentAccommodation = null;
            stayingAt = null;
          }
          // Also clear cruise status if flying
          currentCruise = null;
          onCruise = null;
        }

        // 6. Final check if title is still default
        if (dayTitle === "Location Unknown" && currentAccommodation) {
          const currentAccLoc = locations[currentAccommodation.locationRef]; // Use a different variable name
          dayTitle = currentAccLoc?.name || currentAccommodation.name;
          dayTitle = loc?.name || currentAccommodation.name;
          stayingAt = currentAccommodation.name;
        } else if (dayTitle === "Location Unknown") {
          // If still unknown, maybe look for *any* activity location?
          const firstActivity = dayItems.find(
            (item) => item.locationRef && item.eventType === "activity"
          );
          if (firstActivity) {
            const loc = locations[firstActivity.locationRef];
            dayTitle = loc?.name || "Activity Location";
          } else {
            dayTitle = "Transition / Travel"; // Better default
          }
        }

        dailyInfoByDate[dateStr] = {
          title: dayTitle,
          stayingAt: stayingAt,
          onCruise: onCruise,
        };
      }
      // --- End Pre-processing ---

      // --- Build HTML Itinerary ---
      currentDayNumber = 0; // Reset for the loop
      let currentWeekContainer = null;
      let currentWeekContentDiv = null;
      let weekHasPassed = true;
      let isCurrentWeek = false;

      for (
        let d = new Date(tripStartDate);
        d <= tripEndDate;
        d = addDays(d, 1)
      ) {
        currentDayNumber++;
        const dateStr = formatDate(d);
        const dayName = getDayName(d);
        const dayItems = itineraryByDate[dateStr] || [];
        const dailyInfo = dailyInfoByDate[dateStr] || {
          title: "Error",
          stayingAt: null,
          onCruise: null,
        };

        // --- Find or Create Week Container ---
        const currentWeekData = weeks.find((w) => {
          const weekStart = parseDate(w.startDate);
          const weekEnd = parseDate(w.endDate);
          return weekStart && weekEnd && d >= weekStart && d <= weekEnd;
        });

        if (
          currentWeekData &&
          (!currentWeekContainer ||
            currentWeekContainer.id !== currentWeekData.id)
        ) {
          weekHasPassed = true;
          isCurrentWeek = false;
          currentWeekContainer = document.createElement("div");
          currentWeekContainer.classList.add("week-container", "collapsible");
          currentWeekContainer.id = currentWeekData.id;
          const weekHeaderDiv = document.createElement("div");
          weekHeaderDiv.classList.add("week-header", "collapsible-header");
          weekHeaderDiv.textContent = currentWeekData.weekHeader;
          weekHeaderDiv.addEventListener("click", () =>
            toggleCollapse(currentWeekContainer)
          );
          currentWeekContainer.appendChild(weekHeaderDiv);
          currentWeekContentDiv = document.createElement("div");
          currentWeekContentDiv.classList.add("collapsible-content");
          currentWeekContainer.appendChild(currentWeekContentDiv);
          mainContent.appendChild(currentWeekContainer); // Append directly to main
        }

        // --- Create Day Container ---
        const dayContainer = document.createElement("div");
        dayContainer.classList.add("day-container", "collapsible");
        dayContainer.id = `day-${dateStr}`;
        const dayHeaderDiv = document.createElement("div");
        dayHeaderDiv.classList.add("day-header", "collapsible-header");
        dayHeaderDiv.addEventListener("click", () =>
          toggleCollapse(dayContainer)
        );

        const dayNameSpan = document.createElement("span");
        dayNameSpan.textContent = dayName;
        dayHeaderDiv.appendChild(dayNameSpan);

        // --- Add Day Title ---
        const dayTitleDiv = document.createElement("span");
        dayTitleDiv.classList.add("day-title");
        dayTitleDiv.textContent = dailyInfo.title;
        dayHeaderDiv.appendChild(dayTitleDiv);

        const dayDateSpan = document.createElement("span");
        dayDateSpan.classList.add("day-date");
        dayDateSpan.textContent = `Day ${currentDayNumber}`;
        dayHeaderDiv.appendChild(dayDateSpan);
        dayContainer.appendChild(dayHeaderDiv);

        const dayContentDiv = document.createElement("div");
        dayContentDiv.classList.add("collapsible-content");
        dayContainer.appendChild(dayContentDiv);

        // --- Add Accommodation Stay Indicator ---
        const isCheckInOutDay = dayItems.some(
          (item) =>
            item.eventType === "accommodation-check-in" ||
            item.eventType === "accommodation-check-out"
        );
        // Show indicator only if stayingAt is set AND it's not the check-in day itself
        const isCheckInDay = dayItems.some(
          (item) => item.eventType === "accommodation-check-in"
        );
        if (dailyInfo.stayingAt && !isCheckInDay) {
          const stayIndicatorDiv = document.createElement("div");
          stayIndicatorDiv.classList.add("accommodation-stay-indicator");
          stayIndicatorDiv.innerHTML = `🏨 Staying at: <span>${dailyInfo.stayingAt}</span>`;
          dayContentDiv.appendChild(stayIndicatorDiv);
        }

        // --- Populate Day Content (Filter generic activities) ---
        const filteredDayItems = dayItems.filter(
          (item) =>
            !(
              item.eventType === "activity" &&
              isGenericExploreActivity(
                item.description || item.multiDayDescription,
                dailyInfo.title
              )
            )
        );

        if (
          filteredDayItems.length === 0 &&
          !(dailyInfo.stayingAt && !isCheckInDay)
        ) {
          // Check if only indicator is present
          const noEventDiv = document.createElement("div");
          noEventDiv.classList.add("event", "no-event");
          const isTravel = dayItems.some((item) =>
            [
              "flight",
              "cruise-embark",
              "cruise-disembark",
              "accommodation-check-in",
              "accommodation-check-out",
            ].includes(item.eventType)
          );
          noEventDiv.textContent = isTravel
            ? "Travel day - see details below if any."
            : "No specific events scheduled.";
          // Only add "no events" if there isn't already a stay indicator
          if (!dayContentDiv.querySelector(".accommodation-stay-indicator")) {
            dayContentDiv.appendChild(noEventDiv);
          }
        } else {
          filteredDayItems.forEach((item) => {
            let description = "";
            // Use multiDayDescription if available for activities, otherwise original description
            if (item.eventType === "activity" && item.multiDayDescription) {
              description = item.multiDayDescription;
            } else {
              description = item.description || ""; // Fallback needed
            }

            // Adjust specific descriptions
            if (item.eventType === "accommodation-check-in")
              description = `Check-in: ${item.name}`;
            if (item.eventType === "accommodation-check-out")
              description = `Check-out: ${item.name}`;
            if (item.eventType === "cruise-embark")
              description = `Cruise Embarkation: ${item.shipName}`;
            if (item.eventType === "cruise-disembark")
              description = `Cruise Disembarkation: ${item.shipName}`;
            if (item.eventType === "cruise-port-call")
              description = `Port Call: ${
                locations[item.locationRef]?.name || "Unknown Port"
              }`;
            if (item.eventType === "cruise-sea-day")
              description = `At Sea (${item.shipName})`;

            const eventDiv = document.createElement("div");
            const certaintyClass =
              item.certainty === "tentative" ? "tentative-event" : null;
            let baseClass = "event";
            if (item.eventType) {
              // Create class like 'accommodation-check-in-event' or 'flight-event'
              baseClass += ` ${item.eventType.replace(/_/g, "-")}-event`;
            } else {
              baseClass += " unknown-event";
            }
            eventDiv.classList.add(...baseClass.split(" "));
            if (certaintyClass) eventDiv.classList.add(certaintyClass);

            let location = null;
            let time = item.time || "";
            let details = item.details || "";

            // Location logic
            if (
              [
                "accommodation-check-in",
                "accommodation-check-out",
                "cruise-port-call",
                "car-rental",
                "activity",
              ].includes(item.eventType) &&
              item.locationRef
            ) {
              location = locations[item.locationRef];
            } else if (
              item.eventType === "cruise-embark" &&
              item.departurePortRef
            ) {
              location = locations[item.departurePortRef];
              time = time || "TBD";
            } else if (
              item.eventType === "cruise-disembark" &&
              item.arrivalPortRef
            ) {
              location = locations[item.arrivalPortRef];
              time = time || "TBD";
            } else if (item.eventType === "cruise-sea-day") {
              location = { name: "At Sea" };
              time = "All Day";
            } else if (item.eventType === "flight" && item.locationRef) {
              // Optional: If flight has a primary airport ref
              location = locations[item.locationRef];
            }

            // Time logic for port calls
            if (item.eventType === "cruise-port-call") {
              time = `${item.startTime || ""} - ${item.endTime || ""}`.trim();
            }

            if (time) {
              const timeDiv = document.createElement("div");
              timeDiv.classList.add("event-time");
              timeDiv.textContent = time;
              eventDiv.appendChild(timeDiv);
            }

            const descriptionDiv = document.createElement("div");
            descriptionDiv.textContent = description;
            eventDiv.appendChild(descriptionDiv);

            if (details) {
              // Show details for non-flights, or always? Re-evaluating. Show for flights too.
              const detailsDiv = document.createElement("div");
              detailsDiv.textContent = details;
              eventDiv.appendChild(detailsDiv);
            }

            if (location) {
              const locationDiv = document.createElement("div");
              locationDiv.classList.add("location");
              locationDiv.innerHTML = formatLocation(location);
              eventDiv.appendChild(locationDiv);
            }
            if (item.certainty === "tentative") {
              const tentativeSpan = document.createElement("span");
              tentativeSpan.classList.add("tentative-marker");
              tentativeSpan.textContent = "(Tentative)";
              eventDiv.appendChild(tentativeSpan);
            }

            dayContentDiv.appendChild(eventDiv);
          });
        }

        // --- Default Collapse Logic for Day ---
        const dayDate = new Date(d);
        if (dayDate < todayDateOnly) {
          dayContainer.classList.add("collapsed");
        } else {
          dayContainer.classList.add("expanded");
          weekHasPassed = false;
          if (dayDate.getTime() === todayDateOnly.getTime()) {
            dayContainer.classList.add("current-day");
            isCurrentWeek = true;
          }
        }

        if (currentWeekContentDiv) {
          currentWeekContentDiv.appendChild(dayContainer);
        } else {
          console.warn(
            "Attempted to add day container without a current week content div."
          );
        }

        // --- Set Week Collapse State After Processing Last Day of Week ---
        const weekEndDate = currentWeekData
          ? parseDate(currentWeekData.endDate)
          : null;
        if (weekEndDate && d.getTime() === weekEndDate.getTime()) {
          if (weekHasPassed && !isCurrentWeek) {
            currentWeekContainer.classList.add("collapsed");
          } else {
            currentWeekContainer.classList.add("expanded");
          }
        }
      } // End date loop

      // --- Trip progress calculation ---
      function updateTripProgress() {
        const today = new Date();
        const todayDateOnly = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );

        // Use pre-calculated UTC dates stored on 'data' object
        const tripStartDateUTC = data.tripStartDateUTC;
        const tripEndDateUTC = data.tripEndDateUTC;

        if (
          !tripStartDateUTC ||
          !tripEndDateUTC ||
          isNaN(tripStartDateUTC.getTime()) ||
          isNaN(tripEndDateUTC.getTime())
        ) {
          console.error(
            "Error: Invalid UTC start/end dates for progress calculation."
          );
          const progressText = document.getElementById("progress-text");
          if (progressText)
            progressText.textContent = "Error calculating progress.";
          return;
        }

        // Find today's container ID
        const todayId = `day-${formatDate(todayDateOnly)}`;
        const todayContainer = document.getElementById(todayId);

        let progress = 0;
        let statusText = "";

        // Use UTC dates for comparison
        const todayUTC = new Date(
          Date.UTC(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            12,
            0,
            0
          )
        );

        if (todayUTC < tripStartDateUTC) {
          progress = 0;
          const diffTime = tripStartDateUTC.getTime() - todayUTC.getTime();
          const daysToStart = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          statusText = `Trip starts in ${daysToStart} day${
            daysToStart !== 1 ? "s" : ""
          }`;
        } else if (todayUTC > tripEndDateUTC) {
          progress = 100;
          statusText = "Trip completed";
        } else {
          const totalDuration =
            tripEndDateUTC.getTime() - tripStartDateUTC.getTime();
          const elapsed = todayUTC.getTime() - tripStartDateUTC.getTime();

          if (totalDuration > 0) {
            progress = Math.min(
              100,
              Math.round((elapsed / totalDuration) * 100)
            );
          } else {
            progress = todayUTC >= tripStartDateUTC ? 100 : 0;
          }

          const totalTripDays =
            Math.round(totalDuration / (1000 * 60 * 60 * 24)) + 1;
          const tripDay = Math.round(elapsed / (1000 * 60 * 60 * 24)) + 1;
          const daysLeft = Math.round(
            (tripEndDateUTC.getTime() - todayUTC.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          statusText = `Day ${tripDay} of ${totalTripDays} (${daysLeft} day${
            daysLeft !== 1 ? "s" : ""
          } remaining)`;

          if (todayContainer) {
            todayContainer.classList.remove("collapsed");
            todayContainer.classList.add("expanded", "current-day");
            const parentWeek = todayContainer.closest(".week-container");
            if (parentWeek) {
              parentWeek.classList.remove("collapsed");
              parentWeek.classList.add("expanded");
            }

            if (!todayContainer.dataset.scrolled) {
              setTimeout(() => {
                todayContainer.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
                todayContainer.dataset.scrolled = "true";
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
      // Try appending error after progress bar if it exists
      if (progressContainer && progressContainer.parentNode === mainContent) {
        mainContent.insertBefore(errorDiv, progressContainer.nextSibling);
      } else {
        mainContent.appendChild(errorDiv);
      }
    });
});
